import { useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shadcn/ui/form'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/shadcn/ui/sheet'
import { Input } from '@/shadcn/ui/input'
import { Switch } from '@/shadcn/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shadcn/ui/tooltip'
import { useWebControlSettingStore } from '@/store/useWebControlSettingStore'
import { useStreamConfigStore } from '@/store/useStreamConfigStore'
import { useLoadingStore } from '@/store/useLoadingStore'
import { useToast } from '@/hooks/useToast'

import { closeWebSocket, createWebSocket, sendMessage } from '@/lib/websocket'
import emitter from '@/lib/bus'
import { START_WEB_CONTROL, WEBSOCKET_MESSAGE_TYPE } from '../../../../../const'
import { errorCodeToI18nMessage, SUCCESS_CODE } from '../../../../../code'

const formSchema = z.object({
  webControlPath: z.string(),
  enableWebControl: z.boolean()
})

interface StreamConfigSheetProps {
  sheetOpen: boolean
  setSheetOpen: (status: boolean) => void
}

export default function WebControlSettingSheet(props: StreamConfigSheetProps) {
  const { t } = useTranslation()
  const { setLoading } = useLoadingStore()
  const { sheetOpen, setSheetOpen } = props

  const { webControlSetting, setWebControlSetting } = useWebControlSettingStore((state) => state)
  const { updateStreamConfig, removeStreamConfig, addStreamConfig } = useStreamConfigStore(
    (state) => state
  )

  const { toast } = useToast()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      webControlPath: webControlSetting.webControlPath || '',
      enableWebControl: webControlSetting.enableWebControl
    }
  })

  useEffect(() => {
    async function handleStartWebControl(timeout = 0) {
      const currentWebControlSetting = useWebControlSettingStore.getState().webControlSetting
      await setWebControlSetting({ ...currentWebControlSetting, enableWebControl: true })
      const webControlPath = currentWebControlSetting.webControlPath
      const isSuccess = await startFrpc(webControlPath).catch(() => false)
      if (!isSuccess) {
        await setWebControlSetting({ 
          ...currentWebControlSetting, 
          enableWebControl: false,
          localIP: '',
          localPort: ''
        })

        toast({
          title: t('web_control_setting.start_web_control_failed'),
          description: t('web_control_setting.will_retry', { time: (timeout + 1000 * 10) / 1000 }),
          variant: 'destructive'
        })
        setTimeout(() => {
          const { enableWebControl, webControlPath } =
            useWebControlSettingStore.getState().webControlSetting
          if (!enableWebControl && webControlPath) {
            handleStartWebControl(timeout + 1000 * 10)
          }
        }, timeout)
      }
    }

    emitter.on(START_WEB_CONTROL, handleStartWebControl as any)
    return () => {
      emitter.off(START_WEB_CONTROL, handleStartWebControl as any)
    }
  }, [useWebControlSettingStore])

  useEffect(() => {
    form.reset({ 
      webControlPath: webControlSetting.webControlPath || '',
      enableWebControl: webControlSetting.enableWebControl
    })
  }, [webControlSetting])

  useEffect(() => {
    window.api.onFrpcProcessError(async (err) => {
      const currentWebControlSetting = useWebControlSettingStore.getState().webControlSetting
      toast({
        title: t('web_control_setting.frpc_process_error'),
        description: err,
        variant: 'destructive'
      })
      await setWebControlSetting({ 
        ...currentWebControlSetting, 
        enableWebControl: false,
        localIP: '',
        localPort: ''
      })
      closeWebSocket()
    })
  }, [])

  const handleSetSheetOpen = async (status: boolean, trigger = false) => {
    const formValues = form.getValues()
    if (trigger) {
      await setWebControlSetting({
        ...webControlSetting,
        webControlPath: formValues.webControlPath,
        enableWebControl: formValues.enableWebControl
      })
    }

    setSheetOpen(status)
    form.reset()
  }

  const generateRandomPath = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  const handleGenerateWebControlPath = () => {
    const randomPath = generateRandomPath()
    form.setValue('webControlPath', randomPath)
    toast({
      title: t('web_control_setting.generate_path_success'),
      description: t('web_control_setting.generate_path_success_desc')
    })
  }

  const websocketOnMessage = (event: MessageEvent) => {
    const messageObj = JSON.parse(event.data)

    const { type, data } = messageObj

    switch (type) {
      case WEBSOCKET_MESSAGE_TYPE.START_RECORD_STREAM:
        document.getElementById(data + '_play')?.click()
        break
      case WEBSOCKET_MESSAGE_TYPE.PAUSE_RECORD_STREAM:
        document.getElementById(data + '_pause')?.click()
        break
      case WEBSOCKET_MESSAGE_TYPE.REMOVE_STREAM_CONFIG:
        removeStreamConfig(data)
        break
      case WEBSOCKET_MESSAGE_TYPE.UPDATE_STREAM_CONFIG:
        updateStreamConfig(data, data.id)
        break
      case WEBSOCKET_MESSAGE_TYPE.ADD_STREAM_CONFIG:
        addStreamConfig(data)
        break
      case WEBSOCKET_MESSAGE_TYPE.GET_LIVE_URLS:
        {
          const { roomUrl, proxy, cookie, title } = data
          window.api
            .getLiveUrls({
              roomUrl,
              proxy,
              cookie,
              title
            })
            .then(({ code, liveUrls }) => {
              if (code !== SUCCESS_CODE) {
                toast({
                  title,
                  description: t(errorCodeToI18nMessage(code, 'error.get_line.')),
                  variant: 'destructive'
                })
              }
              sendMessage({
                type: WEBSOCKET_MESSAGE_TYPE.UPDATE_LIVE_URLS,
                data: liveUrls || []
              })
            })
        }
        break
    }
  }

  const startFrpc = async (webControlPath: string) => {
    setLoading(true)
    const { status: isSuccess, code, port, localIP } = await window.api.startFrpcProcess(webControlPath)
    const formValues = form.getValues()

    if (isSuccess) {
      createWebSocket(port!, code!, websocketOnMessage)
      sendMessage({
        type: WEBSOCKET_MESSAGE_TYPE.UPDATE_STREAM_CONFIG_LIST,
        data: useStreamConfigStore.getState().streamConfigList
      })
    } else {
      window.api.stopFrpcProcess()
      closeWebSocket()
    }

    setWebControlSetting({ 
      ...webControlSetting,
      webControlPath: formValues.webControlPath,
      enableWebControl: isSuccess,
      localIP: localIP || '127.0.0.1',
      localPort: (port || '8080').toString()
    })

    const prefix = 'web_control_setting.start_web_control'
    toast({
      title: isSuccess ? t(`${prefix}_success`) : t(`${prefix}_failed`),
      description: isSuccess ? t(`${prefix}_success_desc`) : t(`${prefix}_failed_desc`),
      variant: isSuccess ? 'default' : 'destructive'
    })

    setLoading(false)
    return isSuccess
  }

  const handleToggleWebControl = async (status: boolean, field: any) => {
    form.clearErrors('webControlPath')
    if (status) {
      let webControlPath = form.getValues('webControlPath')
      if (!webControlPath) {
        // 如果没有设置路径，自动生成一个
        webControlPath = generateRandomPath()
        form.setValue('webControlPath', webControlPath)
      }

      const isSuccess = await startFrpc(webControlPath)

      if (isSuccess) {
        field.onChange(status)
      }
      return
    }

    window.api.stopFrpcProcess()
    closeWebSocket()
    field.onChange(status)
    setWebControlSetting({ 
      ...webControlSetting,
      webControlPath: form.getValues('webControlPath'),
      enableWebControl: status,
      localIP: '',
      localPort: ''
    })

    toast({
      title: t('web_control_setting.stop_web_control_success'),
      description: t('web_control_setting.stop_web_control_success_desc')
    })
  }

  return (
    <Sheet open={sheetOpen} onOpenChange={(status) => handleSetSheetOpen(status)}>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('web_control_setting.title')}</SheetTitle>
        </SheetHeader>
        <div className="show-scrollbar overflow-y-auto mr-[-14px]">
          <div className=" pl-1 pr-4 pb-2">
            <Form {...form}>
              <form className="space-y-8">
                <FormField
                  control={form.control}
                  name="webControlPath"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('web_control_setting.web_control_path')}</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Input
                            placeholder={t('web_control_setting.web_control_path_placeholder')}
                            {...field}
                          />
                          <Button
                            variant="outline"
                            type="button"
                            onClick={handleGenerateWebControlPath}
                          >
                            {t('web_control_setting.generate_path')}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="enableWebControl"
                  render={({ field }) => (
                    <FormItem>
                      <TooltipProvider delayDuration={400}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <FormLabel className=" cursor-pointer">
                              {t('web_control_setting.enable_web_control')}
                            </FormLabel>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-[400px]">
                              {t('web_control_setting.enable_web_control_tooltip')}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Switch
                        checked={field.value}
                        onCheckedChange={(status) => handleToggleWebControl(status, field)}
                        className="flex"
                      />
                    </FormItem>
                  )}
                />
                {form.getValues('enableWebControl') && form.getValues('webControlPath') && (
                  <FormField
                    control={form.control}
                    name="enableWebControl"
                    render={() => (
                      <FormItem>
                        <FormLabel>{t('web_control_setting.web_control_address')}</FormLabel>

                        <FormControl>
                          <TooltipProvider delayDuration={400}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="overflow-hidden  text-ellipsis text-nowrap">
                                  <a
                                    className="cursor-pointer underline"
                                    onClick={() => {
                                      const webControlUrl = `http://${webControlSetting.localIP || '127.0.0.1'}:${webControlSetting.localPort || '8080'}/${form.getValues('webControlPath')}`
                                      window.api.navByDefaultBrowser(webControlUrl)
                                    }}
                                  >
                                    {`http://${webControlSetting.localIP || '127.0.0.1'}:${webControlSetting.localPort || '8080'}/${form.getValues('webControlPath')}`}
                                  </a>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <div>
                                  {`http://${webControlSetting.localIP || '127.0.0.1'}:${webControlSetting.localPort || '8080'}/${form.getValues('webControlPath')}`}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                )}
              </form>
            </Form>
          </div>
        </div>
        <SheetFooter>
          <Button variant="secondary" onClick={() => handleSetSheetOpen(false, true)}>
            {t('stream_config.confirm')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
