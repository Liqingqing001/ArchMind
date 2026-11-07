# ArchMind: shared local and cloud development

The user develops this repository locally while another session works in the cloud.

- Before editing, inspect `git status`, fetch the remote main branch, and inspect new commits and changes. Fast-forward a clean main checkout with `git merge --ff-only origin/main`.
- Preserve all uncommitted work. Never use `reset --hard`, overwrite unrelated files, or force-push shared branches.
- Implement cloud work on a `cloud/` feature branch from the current remote main. Use a pull request for integration so the user can see the bounded changes and CI results.
- Fetch main again before publishing or merging. Integrate new changes on the feature branch and rerun affected checks. If a semantic conflict cannot be resolved from the code and user instructions, explain the exact conflict before changing behavior.
- Merge only the tested changes. A non-fast-forward or lease rejection is evidence of new work: inspect it instead of forcing an update.
- Report the final branch, commit/PR and verification outcome. Local users should pull main before starting another feature; simultaneous work belongs on separate branches.
- Keep the current conversation workspace, model settings, knowledge taxonomy and source datasets. Avoid broad frontend rewrites for deployment tasks.
- GitHub Pages is an explicitly labelled static demo. Do not put model keys, administrator tokens, private database dumps or personal conversation history in its assets.
- The demo exports only checked-in public knowledge. Actual FastAPI/PostgreSQL/model-provider behavior remains in the normal build.
