import json
a = json.load(open("/tmp/p2/x/out52.json")); b = json.load(open("/tmp/p2/x/out60.json"))
for k in a:
    x, y = a[k], b.get(k)
    if x == y:
        print(f"IGUAL     {k}")
    else:
        print(f"DIFERENTE {k}")
        for f in ("calls", "result", "error"):
            if x.get(f) != y.get(f):
                print(f"   {f}:\n     5.2: {json.dumps(x.get(f))[:400]}\n     6.0: {json.dumps(y.get(f))[:400]}")
