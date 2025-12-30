---
"@timothymwt/start-wizard-cli": patch
---

Fix interactive prompts getting corrupted by background logs by resolving product port conflicts before starting the local stack, and treating local stack ports as owned (not product-level conflicts).


