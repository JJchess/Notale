#!/usr/bin/env bash
# 造 ~/ws2/Notale/exp/ref —— 被试在 jail 里唯一能看见的参考目录。全是实体拷贝,
# 不留指向仓库的软链:gallery-deck-01 就是顺着 pages/assets/lib 的软链 ls 到上级,
# 把整套 harness 的 skill 和反套路清单读了个遍。
set -euo pipefail
N=~/ws2/Notale/notale-v2; R=~/ws2/Notale/exp/ref
rm -rf "$R"; mkdir -p "$R/lib" "$R/gallery"
cp -rL "$N"/vendor/chassis/lib/. "$R/lib/"
for d in monaco-editor pyodide vscode-codicons; do cp -rL "$N/vendor/$d" "$R/lib/$d"; done
cp -rL "$N/vendor/code-workbench" "$R/code-workbench"
cp -rL "$N/workflows/build-code" "$R/build-code"
# 金样本:保留 build-X/samples/… 这一段相对路径,GALLERY.md 里只换前缀
for d in "$N"/workflows/build-*/samples; do
  wf=$(basename "$(dirname "$d")"); mkdir -p "$R/gallery/samples/$wf"
  cp -rL "$d" "$R/gallery/samples/$wf/samples"
done
# GALLERY.md:金样本改指 ref,Pudding/Codrops 仍指 refs/quality(那里没有 harness 文件);
# 去掉画廊 HTML 的 127.0.0.1 地址 —— 那个服务器的根是整个 Notale。
sed -e 's#金样本(notale-v2 workflows/\*/samples,已人审)#金样本(已人审)#' \
    -e 's#~/ws2/Notale/notale-v2/workflows/#~/ws2/Notale/exp/ref/gallery/samples/#g' \
    -e '/127\.0\.0\.1:4190/d' \
    ~/ws2/Notale/refs/quality/INDEX.md > "$R/gallery/GALLERY.md"
# bundles/ 是我们自己把样本拼成一份的产物,带 <omitted> 这类内部记法,不是样本本身;
# GALLERY.md 也只指向样本目录。删掉。
rm -rf "$R"/gallery/samples/*/samples/bundles

# 底盘不进被试的世界:样本和工作台里对 assets/base.css / base.js 的引用逐行删掉,
# 免得它照抄一个不存在的文件。vendor 里只放行 lib。
grep -rIl "assets/base\.\(css\|js\)" "$R" 2>/dev/null | while read -r f; do
  sed -i '/assets\/base\.css/d; /assets\/base\.js/d' "$f"
done
sed -i 's/notale-magnetic-01/magnetic-01/' "$R"/gallery/samples/*/samples/*/*/pages/index.html 2>/dev/null || true
# LIBS.md:去掉"原本在 zzz/"这种出处,并说明可以自己下载别的库和字体图片
python3 - "$R/lib/LIBS.md" <<'MD'
import re, sys
p = sys.argv[1]; t = open(p).read()
t = t.replace("""这些文件**已经在这里了**,不需要下载、不需要复制、不需要检查。""",
              """这些文件已经在这里了。需要别的库、字体或图片,自己下载放进 `pages/assets/` 即可。""")
t = re.sub(r"\n这份文件的原本在[^\n]*\n[^\n]*\n", "\n", t)
t = t.replace("`pages/` 下目前只有 `assets/`,页面和你自己的资源由你新建。\n", "")
open(p, "w").write(t)
MD

echo "ref 建好: $(du -sh "$R" | cut -f1)"
grep -c 'notale-v2\|harness-kit\|infra/' "$R/gallery/GALLERY.md" | xargs -I{} echo "GALLERY.md 里残留的仓库路径: {} 处"
