# k5sat

### 星历计算接口：
    https://github.com/silenty4ng/k5sat

```

git clone https://github.com/silenty4ng/k5sat.git
cd k5sat/Worker+KV

cmd start-dev.bat

```






这里是完整且可以直接运行的代码和具体操作步骤。为了彻底完成你的迁移，我将整个过程分为 **3步**。你只需要跟着复制粘贴和执行命令即可。

### 第一步：创建项目并安装依赖

在你的电脑终端（命令行）中依次运行以下命令：

```bash
# 1. 创建 Cloudflare Worker 项目（直接按回车确认默认选项，选 JavaScript 即可）
npm create cloudflare@latest satellite-api

# 2. 进入项目目录
cd satellite-api

# 3. 安装必须要用到的库 (Web框架、卫星库、时间库)
npm install hono satellite.js dayjs

# 4. 创建 KV 空间 (用来代替你的 Redis)
npx wrangler kv:namespace create CACHE_KV
```
*注意：第4步执行完毕后，终端会输出一段代码，类似 `{ binding = "CACHE_KV", id = "xxxxxxxxxxxxxxxxxxxxx" }`，把它复制下来。*

---

### 第二步：修改配置文件

打开项目目录下的 `wrangler.toml` 文件，全部替换为以下内容（**注意将 `id` 替换为你刚才复制的真实 ID**）：

```toml
name = "satellite-api"
main = "src/index.js"
compatibility_date = "2024-05-10"

# 配置 KV 命名空间（替换 Redis）
[[kv_namespaces]]
binding = "CACHE_KV"
id = "填入你刚才创建生成的_id"
```

---

本地测试一下接口
npx wrangler dev
一键部署到 Cloudflare
npx wrangler deploy