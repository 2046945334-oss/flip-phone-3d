# flip-phone-3d

用 three.js 做的翻盖手机：珠光烤漆外壳、铬边接缝、能翻开、能按键、能 360 度转着看，贴纸能自动抠图、贴在任意一面。

**在线示范**：<https://2046945334-oss.github.io/flip-phone-3d/>（手机打开效果最好）

这个库只管手机本身。屏幕上显示哪些消息、按了 OK 之后做什么，都由你自己决定：把消息列表传进来，按键通过回调还给你。

## 能做什么

- 六种外壳颜色：银、奶白、樱花粉、薄荷、雾蓝、墨黑。外壳是清漆加薄膜干涉的珠光烤漆，转动时颜色会微微偏光，还有细小的闪点
- 上下两半之间有一圈铬边做接缝，铰链分三段，方向键外面有一圈铬环，按键半透明，屏幕前有一层玻璃
- 点一下翻开，翻盖带动画
- 21 个键都能按：上下键翻消息，左右键或通话键切换收件箱和发件箱，OK 打开当前这条，挂断键合上，1~6 键换颜色
- 内屏是老手机那种一次显示一条的界面，外屏显示照片、未读数和最新一条的时间
- 一根手指拖动可以任意方向转着看，松手后会慢慢停下；两指缩放；双击回正
- 可以从页面上某个位置「拿起来」：手机从那里飞到中间并自己翻开，放回去时再落回原处
- 贴纸可以贴在翻盖外面、键盘面、内屏那面和背面这四个面。按住拖动，拖到哪一面就贴到哪一面；两指缩放、旋转；长按撕掉
- 自带抠图：纯色底的图能自动去掉底色，并加一圈白边
- 读屏软件能用：容器里有看不见的「翻开 / 上一条 / 下一条 / 打开」按钮
- 系统开了「减少动态效果」时会自动关掉动画
- 只在画面有变化时才重画，不会一直占着 GPU

## 安装

还没发到 npm，先直接用这个仓库：

```bash
npm install three
npm install github:2046945334-oss/flip-phone-3d
```

也可以把 `src/` 文件夹复制到你的项目里。需要 three.js 0.160 或更新的版本。

## 用法

```html
<div id="phone" style="width: 100vw; height: 100vh"></div>
<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/"
} }
</script>
<script type="module">
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createFlipPhone } from './src/index.js'

const phone = createFlipPhone(document.getElementById('phone'), {
  THREE,
  RoundedBoxGeometry,   // 必填
  RoomEnvironment,      // 可选，传了外壳和铬边才有反光
  color: 'sakura',
  cover: 'photo.jpg',   // 外屏照片
  inbox: [
    { title: '雨好大，记得带伞', tag: '短信', time: Date.now(), unread: true },
  ],
  outbox: [
    { title: '晚饭想吃什么', tag: '短信', time: Date.now(), status: '对方回了', statusTone: 'ok', note: '番茄面' },
  ],
  onOpenItem: (item, tab) => console.log('打开', tab, item),
  onClose: () => phone.close(),
  onStickersChange: list => localStorage.setItem('stickers', JSON.stringify(list)),
})
</script>
```

用打包工具（Vite、webpack、Next.js）时，把 `three/addons/...` 换成 `three/examples/jsm/...`。

## 消息的格式

`inbox` 和 `outbox` 都是数组，每条可以带这些字段，只有 `title` 必填：

| 字段 | 说明 |
| --- | --- |
| `title` | 正文 |
| `tag` | 左上角的小字，比如「短信」「便签」 |
| `time` | 时间戳（毫秒），今天的只显示时分 |
| `unread` | 未读，显示红点，并计入外屏的未读数 |
| `status` | 正文下面一行状态，比如「对方回了」 |
| `statusTone` | `'ok'` 绿色、`'warn'` 橙色，不填是灰色 |
| `note` | 状态下面的引文，会加上「」 |

你也可以加自己的字段（比如 `id`、`url`）。按 OK 时 `onOpenItem(item, tab)` 会把整条原样还给你，`tab` 是 `'in'` 或 `'out'`。

## 选项

| 选项 | 说明 |
| --- | --- |
| `THREE` | 必填 |
| `RoundedBoxGeometry` | 必填 |
| `RoomEnvironment` | 可选，用来做反光 |
| `color` | `'silver'` `'cream'` `'sakura'` `'mint'` `'mist'` `'ink'`，默认 `'sakura'` |
| `warm` | 灯光偏粉暖，默认 `true`；`false` 是偏黄的台灯 |
| `open` | 一开始就翻开，默认 `false` |
| `inbox` / `outbox` | 消息列表 |
| `cover` | 外屏照片网址 |
| `stickers` | 贴纸列表，见下面 |
| `labels` | 改屏幕上的字：`inbox` `outbox` `emptyIn` `emptyOut` `open` `close` `latest` |
| `reducedMotion` | 关掉动画；不传时跟着系统设置 |
| `onOpenItem(item, tab)` | 在某一条上按了 OK，或点了内屏 |
| `onKey(id)` | 按了任何键 |
| `onClose()` | 按了挂断键，或点到手机外面 |
| `onColorChange(name)` | 用 1~6 键换了颜色 |
| `onStickersChange(list)` | 贴纸有变化后的整份新列表，要保存就在这里存 |
| `onError(err)` | 浏览器不支持 WebGL，或 WebGL 中途挂掉 |

## 方法

```js
phone.setInbox(list)        // 换收件箱
phone.setOutbox(list)       // 换发件箱
phone.toast('已发送')        // 屏幕上弹一行小字
phone.setColor('mint')
phone.setCover('photo.jpg') // 传空字符串回到默认渐变
phone.open() / phone.close()
phone.lift(rect)            // 从 rect（getBoundingClientRect() 那样的矩形）拿起来
await phone.putDown(rect)   // 合上，落回 rect
phone.resetView()           // 回到正面
phone.press('down')         // 模拟按键
phone.setEditing(true)      // 进入贴纸编辑
phone.addSticker(src)       // 贴在现在最朝着镜头的那一面，返回这张贴纸
phone.removeSticker(id)
phone.setStickers(list)
phone.stickers              // 现在的贴纸列表
phone.selectedSticker       // 选中那张的 id
phone.destroy()
```

按键 id：`up` `down` `left` `right` `ok` `call` `end` `softL` `softR`，数字键是 `d0`~`d9`、`d*`、`d#`。

## 贴纸

每张贴纸是 `{ id, img, face, u, v, s, r }`：

- `img`：图片网址或 data URL，建议用透明底的 png
- `face`：`'cover'` 翻盖外面、`'body'` 键盘面、`'inner'` 内屏那面、`'back'` 背面
- `u`、`v`：在那一面上的位置，0~1，从左上角算起
- `s`：宽度占机身宽度的比例
- `r`：旋转角度（弧度）

抠图：

```js
import { cutout, shrink } from 'flip-phone-3d'
const raw = await shrink(file, 512)     // 选的文件先缩小
try {
  phone.addSticker(await cutout(raw))   // 去底色，加白边
} catch (e) {
  phone.addSticker(raw)                 // 底色太杂抠不干净时会报错，这时直接用原图
}
```

抠图的做法是从四条边往里灌，把和四个角颜色相近的像素变成透明。所以纯色底的图效果好，照片这种底色复杂的会抠不干净。

`onStickersChange` 给你的列表里，`img` 就是你传进去的那个值。用 data URL 存进 localStorage 很快会满，正式用时最好先把图传到你自己的服务器，再把网址传给 `addSticker`。

## 测试

```bash
npm install
npm test
```

测试不用开浏览器：用真的 three.js 把整台手机搭出来（不渲染），检查 21 个键在翻开后都点得中、合着时一个也点不到、转到背面能贴、贴纸比下面的面先被点到、从页面上拿起来时起点位置正确，以及按键翻页、切换箱子、换颜色、贴纸回调。

## 许可

[CC BY-NC 4.0](./LICENSE)。可以自由使用、修改、分享，但要注明出处，并且**不能用于商业用途**。