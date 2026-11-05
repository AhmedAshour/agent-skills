# Simulator capture helpers for store raws (iOS sim, axe + simctl). Usage:
#   export U=<sim udid> OUT=/tmp/raw; source capture.sh; bar; shot en_today; tap 115 820; scrollto "Fix these" 120
# Coordinates are points (402x874 on iPhone 17 Pro); shots are full-res PNGs plus a 402-wide _s.png to look at.
: "${U:?set U to the simulator udid}"; OUT=${OUT:-/tmp/raw}; mkdir -p "$OUT"
bar(){ xcrun simctl status_bar booted override --time "9:41" --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3; }
shot(){ xcrun simctl io booted screenshot "$OUT/$1.png" >/dev/null 2>&1; python3 -c "from PIL import Image;i=Image.open('$OUT/$1.png');i.resize((402,round(402*i.height/i.width))).save('$OUT/$1_s.png')"; }
tap(){ axe tap -x "$1" -y "$2" --udid "$U" >/dev/null 2>&1; }
tapl(){ axe tap --label "$1" --udid "$U" >/dev/null 2>&1; }             # tap by accessibility label (exact)
has(){ axe describe-ui --udid "$U" 2>/dev/null | grep -q "\"$1\""; }
waitfor(){ for _ in $(seq 1 "${2:-20}"); do has "$1" && return 0; sleep 3; done; return 1; }   # wait for a label (AI replies etc.)
top(){ for _ in 1 2; do axe swipe --start-x 200 --start-y 250 --end-x 200 --end-y 800 --udid "$U" >/dev/null 2>&1; done; sleep 1; }
fy(){ axe describe-ui --udid "$U" 2>/dev/null | python3 -c '
import sys,json
want=sys.argv[1]; d=json.load(sys.stdin)
def walk(n):
  if isinstance(n,dict):
    if (n.get("AXLabel") or "").upper()==want.upper(): print(round(n["frame"]["y"])); sys.exit()
    for v in n.values(): walk(v)
  elif isinstance(n,list): [walk(x) for x in n]
walk(d)' "$1" | head -1; }                                                 # y (points) of a label
scrollto(){ # $1 label, $2 target y in points — scrolls until the label sits there
  for _ in 1 2 3 4 5 6; do y=$(fy "$1"); [ -z "$y" ] && { axe swipe --start-x 200 --start-y 700 --end-x 200 --end-y 400 --duration 1.5 --udid "$U" >/dev/null 2>&1; sleep 1; continue; }
    d=$((y-$2)); [ ${d#-} -lt 12 ] && return; s=$(( d>380 ? 380 : (d< -380 ? -380 : d) ))
    axe swipe --start-x 200 --start-y 600 --end-x 200 --end-y $((600-s)) --duration 1.5 --udid "$U" >/dev/null 2>&1; sleep 1.2; done; }
lbl(){ python3 -c "import json,sys;L,k,f=sys.argv[1:4];print(k if L=='en' else json.load(open(f)).get(k,k))" "$1" "$2" "$3"; }  # translated label: lbl ar 'Fix these' src/i18n/ar.json
