# Gridfinity STL Generator

一个纯前端的 Gridfinity 参数化模型生成网站，支持：

- 模板化生成 Gridfinity 收纳模型
- 浏览器内实时预览
- 导出可 3D 打印的 `STL`
- 中文参数面板

## 开发上下文

如果后续要继续开发、交接给其他人或给 AI 作为上下文，优先看：

[`docs/DEVELOPMENT_CONTEXT.md`](./docs/DEVELOPMENT_CONTEXT.md)

下一阶段需求细化与任务拆分见：

- [`docs/NEXT_PHASE_SPEC.md`](./docs/NEXT_PHASE_SPEC.md)
- [`docs/TASK_BREAKDOWN.md`](./docs/TASK_BREAKDOWN.md)

## 本地开发

### Windows 一键启动

直接双击运行：

[`scripts/start-dev.bat`](./scripts/start-dev.bat)

或者在 PowerShell 里执行：

```powershell
.\scripts\start-dev.bat
```

脚本会：

- 自动检查 `npm`
- 如果没有 `node_modules`，先执行 `npm install`
- 启动开发服务器

启动后在浏览器打开：

```text
http://localhost:5173
```

### 手动启动

```powershell
npm install
npm run dev
```

## 云服务器构建发布

项目是纯静态前端，推荐部署在 Linux + Nginx。

构建脚本：

[`scripts/build-release.sh`](./scripts/build-release.sh)

在云服务器执行：

```bash
chmod +x ./scripts/build-release.sh
./scripts/build-release.sh
```

脚本会：

- 执行 `npm ci`
- 默认执行 `lint` 和 `test`
- 执行生产构建
- 输出 `release/gridfinity-generator.tar.gz`
- 输出一份可直接参考的 `release/nginx.conf`

### 常用环境变量

跳过检查直接构建：

```bash
RUN_CHECKS=0 ./scripts/build-release.sh
```

构建后直接复制到服务器目录：

```bash
DEPLOY_ROOT=/var/www/gridfinity-generator ./scripts/build-release.sh
```

自定义产物目录：

```bash
RELEASE_DIR=/opt/releases ./scripts/build-release.sh
```

## 验证命令

```bash
npm run lint
npm run test:run
npm run build
```
