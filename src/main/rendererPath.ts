import path from "node:path";

export function getRendererIndexPath(mainDirname: string) {
  return path.join(mainDirname, "../../renderer/index.html");
}
