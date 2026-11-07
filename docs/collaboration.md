# 本地与云端协作

GitHub main 是双方同步的共同基线。云端已从 `53970fb` 快进到本地新增的 `3b0aef3`，保留多服务商对话、历史、官方知识与新界面，再创建 `cloud/github-pages-demo` 分支。

每次开始前先检查工作区，然后同步：

```bash
git status
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c local/本次功能名
```

已有未提交修改时，先在自己的功能分支提交，或妥善 stash；不要直接切换/覆盖有改动的文件。云端使用 cloud/ 分支，本地使用 local/ 分支。不要同时在 main 上直接改相同文件。

完成后推送功能分支、通过 PR 合并。合并前再次 fetch main，解决冲突并验证受影响功能。对共享 main 不 force-push；遇到非快进拒绝先读新增提交，不用 reset --hard 清理。

当前协作约定同时写入根目录 AGENTS.md，后续开发会先读它。
