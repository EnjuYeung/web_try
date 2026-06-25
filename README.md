# NAS Movie Wall

轻量私有电影海报墙，按 NAS 目录分类展示电影。默认带有 `server/data/mockMovies.json` 模拟数据库，方便没有挂载真实媒体目录时调试界面。

## 本地开发

```bash
npm install
npm run dev
```

前端开发地址：

```text
http://localhost:5173
```

后端 API：

```text
http://localhost:3000/api/movies
```

## Docker 部署

```bash
docker compose up -d --build
```

访问：

```text
http://你的-unraid-ip:17174
```

Unraid 映射关系：

```text
/mnt/user/Entertain/Movie -> /media/movies:ro
```

默认每日 04:00 执行一次普通全库扫描，用于发现新入库影片。可通过环境变量调整：

```text
DAILY_SCAN_ENABLED=true
DAILY_SCAN_TIME=04:00
METADATA_CACHE_TTL_DAYS=30
```

## 目录约定

```text
/media/movies/
  其他电影/
  欧美电影/
  日韩电影/
  动漫电影/
  国产电影/
  港台电影/
```

每部电影建议一个独立文件夹：

```text
欧美电影/
  Movie Name (2024)/
    Movie Name (2024).mkv
    poster.jpg
    movie.nfo
```

海报优先级：

```text
poster.jpg -> folder.jpg -> cover.jpg -> movie.jpg -> 其他图片
```

NFO 会尝试读取：

```text
title
originaltitle
year
premiered
rating
userrating
runtime
plot
outline
```

## 调试模拟数据库

修改：

```text
server/data/mockMovies.json
```

当 Docker 未挂载真实媒体目录，或真实目录下没有扫描到影片时，应用会自动使用模拟数据库。
