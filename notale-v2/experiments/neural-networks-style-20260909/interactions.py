"""Artifact-specific independent interaction/data checks, not generation rules."""
import argparse
import hashlib
import json
import math
import runpy
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT))
from scripts.style_e2e import save
RUN=ROOT/'runs/nn-style-coherence-0909'
REPORT=ROOT/'runs/nn-style-coherence-0909-report'
BASE='http://localhost:4177/notale-v2/runs/nn-style-coherence-0909/pages/'


def convolution(page):
    data=page.evaluate('''() => ({input:[...document.querySelectorAll('#inputGrid .px')].map(e=>Number(e.firstChild.textContent)),kernel:[...document.querySelectorAll('#kernelMini div')].map(e=>Number(e.textContent))})''')
    expected=[sum(data['input'][(r+i)*6+c+j]*data['kernel'][i*3+j] for i in range(3) for j in range(3)) for r in range(4) for c in range(4)]
    observed=[]
    for i in range(16):
        page.locator('#featGrid .fx').nth(i).click()
        value=float(page.locator('#resultLine').inner_text())
        page.locator('#fillBtn').click()
        observed.append(value)
    filled=[float(s) for s in page.locator('#featGrid .fx').all_inner_texts()]
    done=page.locator('#doneNote').is_visible()
    page.locator('#resetBtn').click()
    reset=page.locator('#featGrid .filled').count()==0
    page.locator('#inputGrid').focus()
    page.keyboard.press('ArrowLeft')
    page.wait_for_timeout(300)
    keyboard_url=page.url
    edge=keyboard_url.endswith('/page-19.html') and float(page.locator('#resultLine').inner_text())==expected[0]
    if not keyboard_url.endswith('/page-19.html'):
        page.goto(BASE+'page-19.html');page.evaluate('document.fonts.ready')
    page.set_viewport_size({'width':800,'height':450})
    page.wait_for_function('Math.abs(stage.getBoundingClientRect().width-800)<1')
    page.locator('#featGrid .fx').nth(15).click()
    small=float(page.locator('#resultLine').inner_text())==expected[15]
    page.locator('#fillBtn').click()
    return {'input':data,'expected':expected,'observed':observed,'filled':filled,'completion_note':done,'reset_empty':reset,'keyboard_edge':edge,'keyboard_url':keyboard_url,'small_click':small,'ok':expected==observed==filled and done and reset and edge and small}


def neuron(page):
    states=[]
    def capture(label):
        values=[float(page.locator('#slider-'+k).input_value()) for k in ('w1','w2','w3','b')]
        z=values[0]+.6*values[1]-.3*values[2]+values[3]
        a=1/(1+math.exp(-z))
        actual=[float(page.locator('#readout-'+k).inner_text()) for k in ('z','a')]
        states.append({'state':label,'values':values,'expected':[z,a],'actual':actual,'ok':abs(z-actual[0])<=.0051 and abs(a-actual[1])<=.0051})
    capture('default')
    for k in ('w1','w2','w3','b'):
        for key in ('Home','End'):
            page.locator('#slider-'+k).focus();page.keyboard.press(key);capture(k+' '+key)
    page.locator('#reset-btn').click();capture('reset')
    return {'states':states,'ok':all(s['ok'] for s in states) and states[0]['values']==states[-1]['values']}


def code_training(page):
    host=next(f for f in page.frames if '/lessons/page-16/index.html' in f.url)
    host.wait_for_function('window.CodeLab&&CodeLab.getState().runtimeReady&&CodeLab.getState().editorReady',timeout=30000)
    host.locator('#runButton').click()
    host.wait_for_function('!CodeLab.getState().running&&CodeLab.getState().frameCount>0',timeout=30000)
    host.evaluate('''() => {while(CodeLab.getState().frameIndex<CodeLab.getState().frameCount-1)document.querySelector('#nextButton').click()}''')
    state=host.evaluate('CodeLab.getState()')
    # Independent central finite differences for every authored parameter.
    ns=runpy.run_path(str(RUN/'pages/assets/lessons/page-16/lesson/starter.py'))
    tests=runpy.run_path(str(RUN/'pages/assets/lessons/page-16/lesson/tests.py'))['run_tests'](ns)
    p=[.2,-.4,.3,.5,.1,-.2,.6,-.8,.3]
    def loss(v):
        h=[1/(1+math.exp(-(v[2*i]*.5+v[2*i+1]+v[4+i]))) for i in range(2)]
        out=1/(1+math.exp(-(v[6]*h[0]+v[7]*h[1]+v[8])))
        return .5*(out-1)**2
    numeric=[]
    for i in range(len(p)):
        plus=p.copy();minus=p.copy();plus[i]+=1e-5;minus[i]-=1e-5
        numeric.append((loss(plus)-loss(minus))/2e-5)
    g=ns['grads'];analytic=g[2][0]+g[2][1]+g[3]+g[0]+[g[1]]
    max_error=max(abs(a-b) for a,b in zip(numeric,analytic))
    return {'browser':state,'lesson_tests':tests,'numeric_gradient':numeric,'authored_gradient':analytic,'max_gradient_error':max_error,'loss_before':ns['loss_before'],'loss_after':ns['loss_after'],'ok':state['outputKind']=='success' and all(t['passed'] for t in tests) and max_error<1e-8}


def attention(page):
    vectors=[[.9,.1,-.2,.6],[.2,.8,.1,-.3],[.7,-.3,.5,-.1],[-.4,.2,.7,.2],[.85,.05,-.15,.55],[-.2,-.6,.3,.4],[-.5,.1,.2,-.6]]
    states=[]
    for i,q in enumerate(vectors):
        page.locator(f'#wbtn-{i}').click()
        scores=[sum(a*b for a,b in zip(q,k))/2 for k in vectors]
        exps=[math.exp(s-max(scores)) for s in scores]
        weights=[e/sum(exps) for e in exps]
        readout=[sum(w*v[d] for w,v in zip(weights,vectors)) for d in range(4)]
        actual=page.evaluate('''() => ({weights:[...document.querySelectorAll('.weight-num')].map(e=>Number(e.textContent)),heights:[...document.querySelectorAll('.weight-bar')].map(e=>parseFloat(e.style.height)),readout:[...document.querySelectorAll('.vecval')].map(e=>Number(e.textContent)),pressed:[...document.querySelectorAll('.word-btn')].map(e=>e.getAttribute('aria-pressed')==='true'),text:document.querySelector('#readoutText').textContent})''')
        numeric_ok=all(abs(a-b)<=.0051 for a,b in zip(actual['weights']+actual['readout'],weights+readout))
        bars_ok=all(abs(a-max(3,w*118))<.01 for a,w in zip(actual['heights'],weights))
        closest=min(range(7),key=lambda j:sum((a-b)**2 for a,b in zip(readout,vectors[j])))
        states.append({'query':i,'expected_weights':weights,'expected_readout':readout,'actual':actual,'closest_euclidean_vector':closest,'max_weight_vector':weights.index(max(weights)),'ok':numeric_ok and bars_ok and actual['pressed']==[j==i for j in range(7)]})
    page.locator('#wbtn-4').focus();page.keyboard.press('Enter')
    keyboard=page.locator('#wbtn-4').get_attribute('aria-pressed')=='true'
    return {'states':states,'keyboard':keyboard,'ok':all(s['ok'] for s in states) and keyboard}


def architecture_quiz(page):
    tasks=['image','text','sensor','tabular']
    # IDs are read from the authored UI; scores are pedagogical choices, not accuracy.
    tasks=page.locator('.task').evaluate_all('els=>els.map(e=>e.id.replace("task-",""))')
    arches=['mlp','cnn','rnn','attn']
    rows=[]
    for task in tasks:
        for arch in arches:
            sel=f'.arch-btn[data-task="{task}"][data-arch="{arch}"]'
            page.locator(sel).click()
            selected=page.locator(sel).get_attribute('aria-pressed')=='true'
            reason=page.locator(f'#task-{task} .verdict-body').inner_text()
            rows.append({'task':task,'arch':arch,'selected':selected,'reason':reason})
    total=int(page.locator('#totalScore').inner_text())
    displayed=sum(int(page.locator(f'#task-{t} .arch-btn[aria-pressed="true"] .score').inner_text().split('/')[0]) for t in tasks)
    selector=f'.arch-btn[data-task="{tasks[-1]}"][data-arch="attn"]'
    page.locator(selector).click()
    cleared=page.locator('#totalScore').inner_text()=='—'
    page.locator(selector).focus();page.keyboard.press('Enter')
    keyboard=page.locator(selector).get_attribute('aria-pressed')=='true'
    return {'choices':rows,'total':total,'sum_displayed_scores':displayed,'deselect_clears_total':cleared,'keyboard':keyboard,'scope':'Control and sum consistency only; fixed preference scores are not empirical model performance.','ok':all(r['selected'] and r['reason'] for r in rows) and total==displayed and cleared and keyboard}


def xor_network(page):
    ids=['u1w1','u1w2','u1b','u2w1','u2w2','u2b']
    states=[]
    def capture(label,mode):
        p=[float(page.locator('#'+k).input_value()) for k in ids]
        expected=[]
        for x,y in [(0,0),(0,1),(1,0),(1,1)]:
            h1=int(p[0]*x+p[1]*y+p[2]>0);h2=int(p[3]*x+p[4]*y+p[5]>0) if mode==2 else 0
            expected.append(int(h1+h2-1.5>0))
        actual=[int(s.split('/判')[-1]) for s in page.locator('.pt-tag').all_inner_texts()]
        score=sum(a==b for a,b in zip(expected,[0,1,1,0]))
        states.append({'state':label,'expected':expected,'actual':actual,'score':page.locator('#scoreReadout').inner_text(),'ok':actual==expected and page.locator('#scoreReadout').inner_text()==f'{score}/4'})
    capture('default',2)
    for k in ids:
        for key in ('Home','End'):
            page.locator('#'+k).focus();page.keyboard.press(key);capture(k+' '+key,2)
    # Construct an independently known XOR solution: OR AND NAND.
    for k,v in zip(ids,[1,1,-.5,-1,-1,1.5]):
        page.locator('#'+k).fill(str(v));page.locator('#'+k).dispatch_event('input')
    capture('known XOR solution',2)
    solved=states[-1]['actual']==[0,1,1,0]
    page.locator('#mode1').click();capture('single mode',1)
    disabled=all(page.locator('#'+k).is_disabled() for k in ids[3:])
    for key in ('Home','End'):
        page.locator('#u1b').focus();page.keyboard.press(key);capture('single bias '+key,1)
    return {'states':states,'known_solution':solved,'second_unit_disabled':disabled,'semantic_issue':'Single mode still thresholds the binary hidden output at 1.5, so every prediction is always zero; this does not demonstrate a movable single-layer decision boundary.','ok':False,'numeric_consistency':all(s['ok'] for s in states) and solved and disabled}


def rnn_steps(page):
    embeds=[[.1,0],[.2,-.1],[0,.1],[-.9,.6],[.3,.5],[.1,.4],[.8,.2],[.1,-.2]]
    wx=[[1.1,-.3],[.4,1],[-.6,.7]];wh=[[.8,-.2,.1],[.1,.7,-.3],[-.2,.1,.6]]
    history=[[0,0,0]]
    for x in embeds:
        history.append([math.tanh(sum(a*b for a,b in zip(w,x))+sum(a*b for a,b in zip(v,history[-1]))) for w,v in zip(wx,wh)])
    states=[]
    for t,h in enumerate(history):
        page.locator(f'.tok[data-t="{t}"]').click()
        actual=[float(s.split('\n')[0]) for s in page.locator('#bars .val').all_inner_texts()]
        states.append({'step':t,'expected':h,'actual':actual,'note':page.locator('#explain').inner_text(),'ok':all(abs(a-b)<=.0051 for a,b in zip(actual,h)) and page.locator('#stepNo').inner_text()==str(t)})
    next_disabled=page.locator('#nextBtn').is_disabled()
    page.locator('#prevBtn').click();previous=page.locator('#stepNo').inner_text()=='7'
    page.locator('#resetBtn').click();reset=page.locator('#stepNo').inner_text()=='0' and page.locator('#prevBtn').is_disabled()
    page.locator('#nextBtn').click();next_ok=page.locator('#stepNo').inner_text()=='1'
    page.locator('body').click(position={'x':1500,'y':850});page.keyboard.press('ArrowRight');page.wait_for_timeout(300)
    keyboard=page.url.endswith('/page-29.html') and page.locator('#stepNo').inner_text()=='2'
    return {'states':states,'next_disabled':next_disabled,'previous':previous,'reset':reset,'next':next_ok,'keyboard':keyboard,'keyboard_url':page.url,'ok':all(s['ok'] for s in states) and next_disabled and previous and reset and next_ok and keyboard}


def permutation(page):
    digit=[3]*7+[0,0,0,0,0,3,0]+[0,0,0,0,3,0,0]+[0,0,0,3,0,0,0]+[0,0,3,0,0,0,0]*3
    weights=[[((.5 if (i*7+c*13)%11==0 and digit[i]>0 else -.05) if c!=3 else (1.3 if digit[i]>0 else -1)) for i in range(49)] for c in range(5)]
    states=[]
    def probs(scores):
        es=[math.exp(s-max(scores)) for s in scores];return [e/sum(es)*100 for e in es]
    for amount in range(0,101,5):
        page.locator('#imgSlider').fill(str(amount));page.locator('#imgSlider').dispatch_event('input')
        pixels=page.locator('#imgGrid .nt-pixel').evaluate_all('(es)=>es.map(e=>Number(e.dataset.level))')
        expected=probs([b+sum(w*x/3 for w,x in zip(ws,pixels)) for b,ws in zip([.1,-.1,.05,.3,-.05],weights)])
        actual=[float(s.rstrip('%')) for s in page.locator('#imgBars .val').all_inner_texts()]
        states.append({'kind':'image','amount':amount,'expected':expected,'actual':actual,'ok':sorted(pixels)==sorted(digit) and all(abs(a-b)<=.501 for a,b in zip(actual,expected))})
    words=['这','部','电影','毫无','亮点','可言'];features=dict(zip(words,[.05,.02,.1,-.9,.6,-.3]))
    for amount in range(0,101,20):
        page.locator('#txtSlider').fill(str(amount));page.locator('#txtSlider').dispatch_event('input')
        seq=page.locator('#txtSeq .nt-token').all_inner_texts()
        neg=-sum(features[w]*p for w,p in zip(seq,[.15,.15,.2,1.3,1.1,.5]))
        expected=probs([.1-neg*.6,.35-abs(neg)*.3,.05+neg])
        actual=[float(s.rstrip('%')) for s in page.locator('#txtBars .val').all_inner_texts()]
        states.append({'kind':'text','amount':amount,'sequence':seq,'expected':expected,'actual':actual,'ok':sorted(seq)==sorted(words) and all(abs(a-b)<=.501 for a,b in zip(actual,expected))})
    return {'states':states,'ok':all(s['ok'] for s in states),'scope':'Fixed illustrative weights, not accuracy of a trained classifier.'}


def final_quiz(page):
    states=[]
    for lr in [.01,.1,.6]:
        page.locator(f'[data-lr="{lr}"]').press('Enter');page.locator('#q1check').press('Enter')
        loss=((1-lr*8)*2)**2
        actual=page.locator('#q1 .evid').inner_text()
        states.append({'q':1,'lr':lr,'loss':loss,'ok':f'{loss:.2f}' in actual and page.locator('#q1').get_attribute('data-state')==('correct' if loss<4 else 'wrong')})
    for g in [2,3,4,5]:
        page.locator(f'[data-g="{g}"]').press('Enter');page.locator('#q2check').press('Enter')
        states.append({'q':2,'guess':g,'ok':page.locator('#q2').get_attribute('data-state')==('correct' if g==3 else 'wrong')})
    for f in [.1,.5,.9]:
        for i in [.1,.5,.9]:
            page.locator(f'[data-forget="{f}"]').press('Enter');page.locator(f'[data-input="{i}"]').press('Enter');page.locator('#q3check').press('Enter')
            v=f*.8+i
            states.append({'q':3,'forget':f,'input':i,'cell':v,'ok':f'{v:.2f}' in page.locator('#q3 .evid').inner_text() and page.locator('#q3').get_attribute('data-state')==('correct' if v>=.65 else 'wrong')})
    for task in ['img','seq','tab']:
        for opt in ['mlp','cnn','rnn']:
            page.locator(f'[data-task="{task}"][data-opt="{opt}"]').press('Enter')
    page.locator('#q4check').press('Enter')
    incorrect=page.locator('#q4').get_attribute('data-state')=='wrong'
    for task,opt in [('img','cnn'),('seq','rnn'),('tab','mlp')]:
        page.locator(f'[data-task="{task}"][data-opt="{opt}"]').press('Enter')
    page.locator('#q4check').press('Enter');correct=page.locator('#q4').get_attribute('data-state')=='correct'
    page.locator('[data-lr="0.1"]').press('Enter');page.locator('#q1check').press('Enter')
    page.locator('[data-g="3"]').press('Enter');page.locator('#q2check').press('Enter')
    page.locator('[data-forget="0.9"]').press('Enter');page.locator('[data-input="0.1"]').press('Enter');page.locator('#q3check').press('Enter')
    completed=page.locator('#progressLabel').inner_text()
    page.locator('[data-g="2"]').press('Enter')
    stale=page.locator('#progressLabel').inner_text()==completed
    page.locator('#q2check').press('Enter');after_recheck=page.locator('#progressLabel').inner_text()
    return {'scope':'Keyboard-operated assertions; prior mouse run failed because evidence text overlaps input buttons.','states':states,'incorrect_match':incorrect,'correct_match':correct,'completed':completed,'stale_solved_after_answer_change':stale,'after_recheck':after_recheck,'semantic_issue':'Keep-old grading only requires cell>=0.65; forget=.1/input=.9 loses 90% of old information but is accepted.','ok':False,'numeric_consistency':all(s['ok'] for s in states) and incorrect and correct}


CASES={'page-03':permutation,'page-05':neuron,'page-07':xor_network,'page-16':code_training,'page-19':convolution,'page-29':rnn_steps,'page-37':attention,'page-41':architecture_quiz,'page-44':final_quiz}


def main():
    ap=argparse.ArgumentParser();ap.add_argument('--only',nargs='*');args=ap.parse_args()
    target=REPORT/'verification/interactions.json'
    rows=json.loads(target.read_text()) if target.exists() else {}
    with sync_playwright() as pw:
        browser=pw.chromium.launch()
        for pid in args.only or CASES:
            path=RUN/'pages'/f'{pid}.html'
            before=hashlib.sha256(path.read_bytes()).hexdigest()
            page=browser.new_page(viewport={'width':1600,'height':900},reduced_motion='reduce')
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            try:
                page.goto(BASE+f'{pid}.html');page.evaluate('document.fonts.ready');page.wait_for_timeout(300)
                row=CASES[pid](page)
                page.screenshot(path=str(target.parent/f'{pid}-operated.png'))
            except Exception as exc:
                row={'ok':False,'error':str(exc),'url':page.url}
            row.update(sha256=before,artifact_unchanged=before==hashlib.sha256(path.read_bytes()).hexdigest(),js_errors=errors)
            row['ok']=bool(row['ok'] and row['artifact_unchanged'] and not errors)
            if pid in rows:
                row['previous_audit']=rows[pid]
            rows[pid]=row;save(target,rows);print(pid,json.dumps(row,ensure_ascii=False),flush=True)
            page.close()
        browser.close()


if __name__=='__main__':main()
