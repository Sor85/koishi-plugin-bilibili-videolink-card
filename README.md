# koishi-plugin-bilibili-videolink-card

本项目 fork 自 [koishi-shangxue-plugins/koishi-shangxue-apps](https://github.com/koishi-shangxue-plugins/koishi-shangxue-apps/tree/main/) 中的 `bilibili-videolink-analysis` 插件。

解析哔哩哔哩视频链接，并按需返回图文卡片、视频直链或视频文件。

本 fork 将原有文本图文替换为 Takumi 渲染的 PNG 视频卡片：卡片展示封面、时长、播放与互动统计、UP 主、弹幕、最多 5 条热门评论及评论用户等级。

## 功能

- 识别 B 站视频链接、小程序分享卡片、BV/AV视频号
- “图文”组件生成 B 站风格 PNG 卡片，不再使用可编辑文本模板
- 卡片包含封面与自适应时长、播放与互动统计、UP 主、弹幕、最多 5 条热门评论和用户等级
- 按配置返回视频直链或视频文件

## 安装

```sh
yarn add koishi-plugin-bilibili-videolink-card
```

图文卡片由插件内置的 Takumi 渲染，不需要额外安装浏览器或 Puppeteer 服务。

## 构建

```sh
yarn install
yarn build
```
