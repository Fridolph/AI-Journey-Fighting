# 第 07 章：Milvus 数据丢失后的重建流程

## 写在前面

如果 `volumes/` 被删掉，Milvus 本地数据通常就等于一起没了。

这里要先有一个很现实的判断：

- 容器还能重新启动，不代表旧数据还在
- `docker compose up -d` 只能帮你把服务重新拉起来
- 真正的数据恢复，取决于你有没有备份，或者能不能重新根据原始数据重建

对于当前这个学习仓库，更实用的目标不是“神奇恢复”，而是把“可重建流程”标准化。

## 什么时候算真的丢了

下面这些情况，基本都可以视为本地 Milvus 数据已经丢失：

- 项目下的 `volumes/` 被删除
- `volumes/` 目录还在，但里面已经是空目录或新初始化内容
- 之前存在的 collection 查不到了
- MinIO、etcd、Milvus 三者的数据目录不一致，导致服务可启动但业务数据不可用

## 重建前先做判断

建议先按下面顺序判断：

1. 先看 `volumes/` 还在不在

```bash
find ./volumes -maxdepth 2 -type d
```

2. 再确认 Milvus 服务是否正常

```bash
docker compose -f ./milvus-standalone-docker-compose.yml ps
```

3. 如果有备份，优先恢复备份，不要急着重跑写入脚本

4. 如果没有备份，再走“从原始数据重建”流程

## 方案 A：从备份恢复

如果你已经通过 `./scripts/milvus-backup.sh` 生成过归档，可以这样恢复：

1. 停掉服务

```bash
docker compose -f ./milvus-standalone-docker-compose.yml down
```

2. 清理当前 `volumes/`

```bash
rm -rf ./volumes
mkdir -p ./volumes
```

3. 解压备份

```bash
tar -xzf ./backups/milvus/你的备份文件.tar.gz -C .
```

如果归档里保存的是 `volumes/` 根目录，解压后会直接还原回来。

4. 重新启动服务

```bash
docker compose -f ./milvus-standalone-docker-compose.yml up -d
```

## 方案 B：从原始数据重建

如果备份没有了，就走下面这条路线。

### 第 1 步：先保留原始数据源

至少确保下面这些东西还在：

- 原始电子书、文本、文档源文件
- 分块逻辑脚本
- embedding 写入脚本
- collection 名称、schema、向量维度等配置

这是最关键的“可重建资产”。

### 第 2 步：重新启动空库

```bash
docker compose -f ./milvus-standalone-docker-compose.yml up -d
```

这一步只是把空的 Milvus 服务启动起来。

### 第 3 步：重新建 collection

根据你项目里的写入脚本或初始化逻辑，重新创建 collection、索引和字段 schema。

如果原脚本本身就包含“如果不存在则创建 collection”，这一步会更顺。

### 第 4 步：重新切分数据

如果之前实验依赖不同 chunk 策略，例如：

- `chunkSize=400`
- `chunkSize=800`
- `chunkSize=1600`

那就要按实验口径重新切分，不要混用旧结果和新结果。

### 第 5 步：重新向量化并写入

重新跑 embedding 与写入脚本，把数据再次写入 Milvus。

这一阶段要特别注意：

- 向量维度要和 schema 一致
- collection 名称要和查询脚本对上
- 不同实验参数要分别落到对应 collection，避免相互污染

### 第 6 步：重新验证查询

写入后，先不要急着跑完整问答流程，建议先验证三件事：

1. collection 是否存在
2. 数据条数是否符合预期
3. 简单 query / search 是否能返回结果

验证通过后，再继续跑 RAG 问答对照实验。

## 一个很重要的经验

对学习项目来说，真正重要的不是“数据库文件本身”，而是下面两类东西：

1. 原始数据源
2. 可重复执行的构建脚本

只要这两类资产还在，哪怕 Milvus 本地数据被清空，也只是“重建成本高一些”，不是彻底无法恢复。

## 我建议的最小恢复闭环

以后如果再遇到类似情况，可以固定按这套顺序处理：

1. 先判断 `volumes/` 是不是还在
2. 有备份就恢复备份
3. 没备份就重启空库
4. 重新建 collection
5. 重新切分与向量化
6. 重新写入 Milvus
7. 用查询脚本验证结果
8. 重新开始问答实验

这样遇到问题时就不会慌，也不会一边猜一边改。
