<div align=center>
<img  src="https://raw.githubusercontent.com/chenfan0/fideo-live-record/main/src/renderer/src/assets/images/light/logo.png" />
</div>

## ✋🏻 简介
这是一个基于`React` `Ffmpeg` `Electron` `Shadcn`, `FRP` 的**直播录制软件**。支持监控直播，可以帮助用户简单便捷的对直播进行录制并保存为MP4格式的视频。

Fideo 官方网站：[https://www.fideo.site/cn](https://www.fideo.site/cn)

## 已支持平台
YouTube Twitch TikTok 抖音 快手 B站 网易 CC 花椒 微博 斗鱼 淘宝 Bigo YY 虎牙 京东 时光 陌陌 17LIVE 小红书 AcFun 畅聊 vv直播 克拉克拉

## 📚 使用说明
#### 🔧 安装
- 进入 [Release](https://github.com/chenfan0/fideo-live-record/releases) 下载对应操作系统版本并安装即可。
#### 🔨 Mac显示文件已损坏
- 在终端输入以下命令即可
```shell
sudo xattr -r -d com.apple.quarantine /Applications/Fideo.app
```
#### 💉 windows报病毒
- 直接忽略即可

#### 🔓 下载时被浏览器屏蔽
- 尝试更换浏览器下载

#### 🍪 如何获取cookie
- [获取cookie教程](https://www.bilibili.com/video/BV1G24y1o75g/?spm_id_from=333.337.search-card.all.click&vd_source=7175c3866fe9ca259066ef7898056268)

#### 🛰 如何微信推送
- 微信推送的功能使用的是 [息知](https://xz.qqoq.net/) 的API，需要自行注册账号并获取API Key。
- 在默认设置中填入 **息知** 的API Key即可。

#### 📱 网页操作
- 获取激活并输入激活码，然后启动该功能即可在手机访问网页进行软件操作。

## ❓ 如何在本地运行？
##### 需要npm环境node.js
##### Windows 用户：
##### 下载地址：https://www.gyan.dev/ffmpeg/builds/
##### 解压并把 bin 目录添加到系统 PATH
```shell
npm install -g pnpm
```
获取当前目录，加到path系统环境变量才能使用pnpm命令
```shell
npm config get prefix
```
electron是前端用于打包成exe文件或者linux系统用的文件
```shell
pnpm -v
pnpm add -D electron
pnpm install
```
```shell
$env:DEBUG = "fideo-*"
pnpm run dev
```
打包成exe,需要管理员权限的cmd窗口运行，需要几分钟时间打包,然后在dist目录内带版本号的exe可安装文件
```shell
pnpm exec electron-builder
```
