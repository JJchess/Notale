import math

# 设计一个非线性可分数据集：类似 XOR 分布，轴对齐单层树桩需要多轮才能拟合好
pts = [
    (2,2,+1),(2,7,+1),(7,2,+1),(7,7,+1),   # 四角 +1
    (2,4.5,-1),(7,4.5,-1),(4.5,2,-1),(4.5,7,-1),  # 四边中点 -1
    (4.5,4.5,+1),  # 中心 +1 (更像 XOR 变体)
    (1,1,+1),
]
X = [(x,y) for x,y,l in pts]
Y = [l for x,y,l in pts]
n = len(pts)

def stump_candidates():
    cands = []
    xs = sorted(set(p[0] for p in X))
    ys = sorted(set(p[1] for p in X))
    for i in range(len(xs)-1):
        cands.append(('x', (xs[i]+xs[i+1])/2))
    for i in range(len(ys)-1):
        cands.append(('y', (ys[i]+ys[i+1])/2))
    return cands

def best_stump(w):
    best = None
    for axis, thresh in stump_candidates():
        for polarity in (1,-1):
            preds = []
            for (x,y) in X:
                v = x if axis=='x' else y
                pred = 1 if v < thresh else -1
                pred *= polarity
                preds.append(pred)
            err = sum(w[i] for i in range(n) if preds[i]!=Y[i])
            if best is None or err < best[0]:
                best = (err, axis, thresh, polarity, preds)
    return best

rounds = 4
w = [1/n]*n
history = []
stumps = []
for t in range(rounds):
    err, axis, thresh, polarity, preds = best_stump(w)
    err_c = max(min(err, 1-1e-10), 1e-10)
    alpha = 0.5*math.log((1-err_c)/err_c)
    neww = []
    for i in range(n):
        neww.append(w[i]*math.exp(-alpha*Y[i]*preds[i]))
    Z = sum(neww)
    neww = [v/Z for v in neww]
    history.append({'t':t+1,'axis':axis,'thresh':thresh,'polarity':polarity,'err':err,'alpha':alpha,
                     'w_before':w[:], 'w_after':neww[:], 'preds':preds})
    stumps.append((axis,thresh,polarity,alpha))
    w = neww

for h in history:
    print(f"Round {h['t']}: axis={h['axis']} thresh={h['thresh']:.2f} polarity={h['polarity']} err={h['err']:.4f} alpha={h['alpha']:.4f}")
    print("  w_before:", [round(x,4) for x in h['w_before']])
    print("  preds:   ", h['preds'])
    print("  w_after: ", [round(x,4) for x in h['w_after']])

def strong_predict(x,y,upto):
    s = 0
    for axis,thresh,polarity,alpha in stumps[:upto]:
        v = x if axis=='x' else y
        pred = 1 if v < thresh else -1
        pred *= polarity
        s += alpha*pred
    return (1 if s>=0 else -1), s

for upto in range(1,rounds+1):
    correct=0
    for i,(x,y,l) in enumerate(pts):
        pred,s = strong_predict(x,y,upto)
        correct += (pred==l)
    print(f"after {upto} rounds accuracy = {correct}/{n}")
