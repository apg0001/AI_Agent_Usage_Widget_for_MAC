import { nativeImage, NativeImage } from "electron";

// 트레이 아이콘은 숨겨진 창에 SVG를 그려 만든다. 오프스크린 렌더링이 실패하는 환경
// (리눅스 + 일부 GPU/Wayland 조합이 대표적이다)에서 빈 이미지를 넘기면 인디케이터가
// 아예 보이지 않고, 이 앱은 창도 독 아이콘도 없어서 사용자가 접근할 방법이 사라진다.
// 그래서 같은 정적 아이콘을 PNG로 구워 최후의 수단으로 들고 다닌다.
const STATIC_TRAY_ICON_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAB5ElEQVR4nOyXu0sDQRDGZ3OxiAElsYgophIPrKxSqNhYmUKw" +
  "8VHYWYjaWQj+A2IhWEQbLbTx1aRLJzY+IIVYaSJWkfgoTCqxOPTcL7phL0TYPS65xh8M3OwemW9n5jZMkCQiXf1x+vpc5I9J" +
  "bia3FvIGi1ueW4YCxlb56bYgNph4iMb65mzGtj0M+qcYZtsLpdf7XTiGFHxH+A3GIMbGW8MdxY/3t2v2m/YHavzJa7F4OXqN" +
  "UDi6yp0Raj4G2bYVpJ+G84skBJjkHyYENLv2Mi0BckG8p5tKzzmHYc0NrgTMTE4oranAIp2mTZrgxPUYSIxS4bFIOmhnYGV5" +
  "qfqMYHLA4cEE6aItYEgKcnicrphg2kUZtASg0eRTrm+k6OIqW/Wxp9uMWgLkRhOpP7/MOsqg24xaTSg3n1x/OStYQzOqElR9" +
  "sTa18OulW5QJmVFBuQQ6qdVpRqUS4FQ32dOqf8A7/+gk7XgntbnmyIjqnaCUgdrTIzhSLJv8OQLVO0FNwJSz++vVV/4cgWoZ" +
  "XF3FXuLqz+hfgNcCLPIPCwLy5B95CMiQf2R8H0wCGBQxq1GTQUzErsyCmNEwq/GZbYwaPx9iOJ13DKdCRKgtto9xibvt3CLk" +
  "nRj85h23PZ722fJL7kxsfAMAAP//zx1MHQAAAAZJREFUAwBPlb6/r1V0NQAAAABJRU5ErkJggg==";

export function createFallbackTrayIcon(): NativeImage {
  return nativeImage.createFromDataURL(`data:image/png;base64,${STATIC_TRAY_ICON_PNG}`);
}
