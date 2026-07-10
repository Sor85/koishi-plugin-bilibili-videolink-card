# koishi-plugin-bilibili-videolink-analysis-fork

本项目 fork 自 [koishi-shangxue-plugins/koishi-shangxue-apps](https://github.com/koishi-shangxue-plugins/koishi-shangxue-apps/tree/main/) 中的 `bilibili-videolink-analysis` 插件。

解析哔哩哔哩视频链接，并按需返回图文卡片、视频直链或视频文件。

## 功能

- 识别 B 站视频链接、小程序分享卡片、BV/AV视频号
- 生成包含封面、统计、UP 主、简介、弹幕和热门评论的 PNG 图文卡片
- 按配置返回视频直链或视频文件

## 安装

```sh
yarn add koishi-plugin-bilibili-videolink-analysis-fork
```

图文卡片依赖 `koishi-plugin-puppeteer` 服务。未启用图文组件时，直链和视频功能不依赖该服务。

## 构建

```sh
yarn install
yarn build
```
