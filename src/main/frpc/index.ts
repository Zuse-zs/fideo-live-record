import fsp from 'node:fs/promises'
import { join } from 'node:path'
import os from 'node:os'
import type { ChildProcess } from 'node:child_process'

import { app, BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyCompress from '@fastify/compress'

import WebSocket from 'ws'
import spawn from 'cross-spawn'
import { FRPC_PROCESS_ERROR, WEBSOCKET_MESSAGE_TYPE } from '../../const'

import debug from 'debug'

const log = debug('fideo-frpc')

const isMac = os.platform() === 'darwin'

export let frpcObj: {
  frpcProcess: ChildProcess
  stopFrpcLocalServer: () => void
  localPort: string
  localIP: string
} | null = null

export function stopFrpc() {
  frpcObj?.frpcProcess.kill()
  frpcObj?.stopFrpcLocalServer()
  frpcObj = null
}

// 获取本地IP地址
function getLocalIP(): string {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name]
    if (iface) {
      for (const alias of iface) {
        if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
          return alias.address
        }
      }
    }
  }
  return '127.0.0.1' // 如果没有找到合适的IP，返回localhost
}

async function startFrpcLocalServer(
  code: string
): Promise<{ port: string; stopFrpcLocalServer: () => void; localIP: string }> {
  let resolve!: (value: unknown) => void, reject!: (reason?: any) => void

  let port: string
  const localIP = getLocalIP()

  const p = new Promise((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })

  const fastify = Fastify()

  fastify.register(fastifyCompress, {
    global: true
  })

  fastify.register(fastifyStatic, {
    root: is.dev ? join(__dirname, '../../resources/dist') : join(process.resourcesPath, 'dist'),
    prefix: `/${code}/`,
    // serve: false,
    setHeaders: (res, path) => {
      console.log('path: ', path)
      if (path.endsWith('.js') || path.endsWith('.css')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      }
    }
  })

  fastify.get(`/${code}`, async (_, reply) => {
    const filePath = is.dev
      ? join(__dirname, '../../resources/dist/index.html')
      : join(process.resourcesPath, 'dist/index.html')

    try {
      const htmlContent = (await fsp.readFile(filePath, 'utf-8'))
        .toString()
        .replace(
          '__WEBSOCKET_URL__',
          `"ws://${localIP}:${port}"`
        )
        .replaceAll('__WEB_CONTROL_CODE__', code)

      reply.code(200).header('Content-Type', 'text/html').send(htmlContent)
    } catch (err) {
      log('err: ', err)
      reply.code(500).header('Content-Type', 'text/plain').send('Internal Server Error')
    }
  })

  fastify.get('/health', async (_, reply) => {
    reply.code(200).header('Content-Type', 'text/plain').send('OK')
  })

  fastify.setNotFoundHandler((_, reply) => {
    reply.code(404).header('Content-Type', 'text/plain').send('Not Found')
  })

  const server = fastify.server
  const wss = new WebSocket.Server({
    server,
    perMessageDeflate: true
  })

  let streamConfigList: IStreamConfig[] = []

  wss.on('connection', (ws) => {
    log('WebSocket client connected')

    ws.send(
      JSON.stringify({
        type: 'UPDATE_STREAM_CONFIG_LIST',
        data: streamConfigList
      })
    )

    ws.on('message', (message) => {
      let messageObj
      try {
        messageObj = JSON.parse(message.toString())
      } catch {
        messageObj = {}
      }
      const { type, data } = messageObj

      switch (type) {
        case WEBSOCKET_MESSAGE_TYPE.UPDATE_STREAM_CONFIG_LIST:
          streamConfigList = data as IStreamConfig[]
          break
        case WEBSOCKET_MESSAGE_TYPE.REMOVE_STREAM_CONFIG:
          streamConfigList = streamConfigList.filter((streamConfig) => streamConfig.id !== data)
          break
        case WEBSOCKET_MESSAGE_TYPE.UPDATE_STREAM_CONFIG:
          streamConfigList = streamConfigList.map((streamConfig) =>
            streamConfig.id === data.id ? data : streamConfig
          )
          break
        case WEBSOCKET_MESSAGE_TYPE.ADD_STREAM_CONFIG:
          if (!data.directory) {
            data.directory = app.getPath('desktop')
          }
          streamConfigList.unshift(data as IStreamConfig)
          break
      }

      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(
            JSON.stringify({
              type,
              data
            })
          )
        }
      })
    })

    ws.on('close', () => {
      log('WebSocket client disconnected')
    })
  })

  const stopFrpcLocalServer = () => {
    fastify.close()
    wss.close()
  }

  fastify.listen({ port: 0, host: '0.0.0.0' }, async (err, address) => {
    if (err) {
      log(err)
      reject()
      stopFrpcLocalServer()
      return
    }

    port = new URL(address).port
    log(`Server is listening on ${address}`)

    resolve({
      port,
      stopFrpcLocalServer,
      localIP
    })
  })

  return p as any
}

let frpcProcessTimer: NodeJS.Timeout

export async function startFrpcProcess(
  code: string,
  writeLog: (title: string, content: string) => void,
  win: BrowserWindow
) {
  try {
    writeLog('frpc', 'code: ' + code)
    log('code: ', code)
    const userPath = app.getPath('userData')
    const { port, stopFrpcLocalServer, localIP } = await startFrpcLocalServer(code)
    writeLog('frpc', 'port: ' + port)
    writeLog('frpc', 'localIP: ' + localIP)
    log('port: ', port)
    log('localIP: ', localIP)

    // 不再需要frpc进程，直接使用本地服务器
    frpcObj = {
      frpcProcess: { kill: () => {} } as any, // 创建一个空的进程对象
      stopFrpcLocalServer,
      localPort: port,
      localIP
    }

    return {
      status: true,
      code,
      port,
      localIP
    }
  } catch {
    return {
      status: false
    }
  }
}
