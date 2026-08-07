"use strict";

const { spawn } = require("node:child_process");
const electronPath = require("electron");

// ELECTRON_RUN_AS_NODE가 환경에 남아있으면(예: VS Code 통합 터미널, 이전 세션의 잔여 사용자 환경변수)
// Electron이 GUI 앱이 아니라 순수 Node 프로세스로 부팅되어 app/BrowserWindow가 undefined가 된다.
// cross-env로 빈 문자열을 넣는 것만으로는 해결되지 않아 키 자체를 지운다.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ["."], { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
