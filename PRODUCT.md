# Xray Console UI 个人节点管理

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
用户指定 Vue 3；TypeScript、Vite。Node.js 标准库提供本机管理 API。

## Users
个人服务器所有者，在浏览器完成原脚本的安装和日常管理。

## Product Purpose
一键安装、显示后台任务进度与服务状态，避免日常手动进入 SSH 执行脚本。

## Capabilities and Constraints
复用 deploy-personal-vpn.sh 管理 Xray REALITY / CF WebSocket、Hysteria2、订阅、MTProto。
显示默认出口网卡的累计流量、实时速率和固定测速结果；主机网卡统计不等同于单节点用量。
真实执行只在 Linux root 后台；本地演示明确标注且不执行系统命令。
任务日志持久化，刷新或关闭网页不取消任务；后台重启后遗留任务标记中断，不重复执行。
单机、单管理员。未要求多用户、计费、流量限额，不实现。

## Brand Commitments
用户选择全深色控制台、中文、现代风格。Xray Console UI 是项目名称。

## Evidence on Hand
用户提供的 ../deploy-personal-vpn.sh；未提供真实服务器或服务器访问凭证。

## Product Principles
先显示实际状态；危险操作明确确认；失败提供原始日志和恢复路径；演示与真实运行严格区分。
