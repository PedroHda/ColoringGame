"""Derive connected, color-aware game region data. Original artwork is unchanged."""
from collections import deque
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
WIDTH, HEIGHT = 336, 189
PALETTE = ['#D4A34E', '#B9684E', '#728452', '#548E98', '#795D49', '#D8C9A8']

def lab(rgb):
    a = rgb / 255.0
    linear = np.where(a > .04045, ((a + .055) / 1.055)**2.4, a / 12.92)
    xyz = linear @ np.array([[.4124564,.2126729,.0193339],[.3575761,.7151522,.1191920],[.1804375,.0721750,.9503041]])
    xyz /= np.array([.95047,1,1.08883])
    f = np.where(xyz > .008856, np.cbrt(xyz), 7.787 * xyz + 16/116)
    return np.stack([116*f[...,1]-16,500*(f[...,0]-f[...,1]),200*(f[...,1]-f[...,2])],axis=-1)

def connected(labels, count):
    h,w = labels.shape
    visited = np.zeros((h,w),bool)
    largest = [[] for _ in range(count)]
    for y in range(h):
        for x in range(w):
            if visited[y,x]: continue
            value = labels[y,x]; visited[y,x] = True
            todo = [(x,y)]; part=[]
            for px,py in todo:
                part.append((px,py))
                for nx,ny in ((px-1,py),(px+1,py),(px,py-1),(px,py+1)):
                    if 0 <= nx < w and 0 <= ny < h and not visited[ny,nx] and labels[ny,nx] == value:
                        visited[ny,nx] = True; todo.append((nx,ny))
            if len(part) > len(largest[value]): largest[value] = part
    result = np.full((h,w),-1,np.int32)
    for i,part in enumerate(largest):
        for x,y in part: result[y,x] = i
    frontier = deque()
    for y in range(h):
        for x in range(w):
            if result[y,x] < 0: continue
            if any(0 <= nx < w and 0 <= ny < h and result[ny,nx] < 0 for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1))): frontier.append((x,y))
    while frontier:
        x,y=frontier.popleft()
        for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
            if 0 <= nx < w and 0 <= ny < h and result[ny,nx] < 0:
                result[ny,nx] = result[y,x]; frontier.append((nx,ny))
    _, inverse = np.unique(result,return_inverse=True)
    return inverse.reshape(h,w)

def build(rgb, columns, rows):
    colors = lab(rgb)
    yy,xx = np.mgrid[0:HEIGHT,0:WIDTH]
    features=np.dstack([colors,xx,yy])
    centers=[]
    for cy in (np.arange(rows)+.5)*HEIGHT/rows:
        for cx in (np.arange(columns)+.5)*WIDTH/columns:
            centers.append(features[int(cy),int(cx)].copy())
    centers=np.asarray(centers); count=len(centers)
    step=max(WIDTH/columns,HEIGHT/rows); compactness=22/step
    labels=np.zeros((HEIGHT,WIDTH),np.int32)
    for _ in range(7):
        distance=np.full((HEIGHT,WIDTH),np.inf)
        for i,center in enumerate(centers):
            cx,cy=center[3:]; x0=max(0,int(cx-step*1.6)); x1=min(WIDTH,int(cx+step*1.6)+1)
            y0=max(0,int(cy-step*1.6)); y1=min(HEIGHT,int(cy+step*1.6)+1)
            region=features[y0:y1,x0:x1]
            delta=region-center
            d=np.sum(delta[...,:3]**2,axis=-1)+np.sum(delta[...,3:]**2,axis=-1)*compactness**2
            local=distance[y0:y1,x0:x1]; better=d<local
            local[better]=d[better]; labels[y0:y1,x0:x1][better]=i
        sizes=np.bincount(labels.ravel(),minlength=count)
        for channel in range(5):
            sums=np.bincount(labels.ravel(),weights=features[...,channel].ravel(),minlength=count)
            centers[:,channel]=np.where(sizes>0,sums/np.maximum(sizes,1),centers[:,channel])
    labels=connected(labels,count)
    # Furthest interior points give readable numbers inside irregular regions.
    distances=np.full((HEIGHT,WIDTH),9999,np.int32); queue=deque()
    for y in range(HEIGHT):
        for x in range(WIDTH):
            if x==0 or y==0 or x==WIDTH-1 or y==HEIGHT-1 or any(labels[ny,nx]!=labels[y,x] for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1))):
                distances[y,x]=0; queue.append((x,y))
    while queue:
        x,y=queue.popleft()
        for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
            if 0<=nx<WIDTH and 0<=ny<HEIGHT and labels[ny,nx]==labels[y,x] and distances[ny,nx]>distances[y,x]+1:
                distances[ny,nx]=distances[y,x]+1; queue.append((nx,ny))
    palette_rgb=np.array([[int(c[i:i+2],16) for i in (1,3,5)] for c in PALETTE])
    palette_lab=lab(palette_rgb)
    regions=[]
    for i in range(int(labels.max())+1):
        mask=labels==i; ys,xs=np.nonzero(mask)
        # Penalize points on the image edge and favor an interior near the centroid.
        score=distances.astype(float)-np.hypot(xx-xs.mean(),yy-ys.mean())*.025
        score[~mask]=-np.inf; y,x=np.unravel_index(np.argmax(score),score.shape)
        average=np.median(rgb[mask],axis=0); average_lab=lab(average)
        color=int(np.argmin(np.sum((palette_lab-average_lab)**2,axis=-1)))+1
        regions.append({'id':i,'x':round(x/WIDTH,5),'y':round(y/HEIGHT,5),'color':color,'pixels':int(mask.sum()),'bounds':[int(xs.min()),int(ys.min()),int(xs.max())+1,int(ys.max())+1]})
    flat=labels.ravel(); ends=np.flatnonzero(np.r_[flat[1:]!=flat[:-1],True])+1; starts=np.r_[0,ends[:-1]]
    runs=np.column_stack([flat[starts],ends-starts]).ravel().tolist()
    return {'width':WIDTH,'height':HEIGHT,'regions':regions,'runs':runs}

if __name__=='__main__':
    for path in sorted((ROOT/'dist/history/images').glob('*.png')):
        image=Image.open(path).convert('RGB').resize((WIDTH,HEIGHT)).filter(ImageFilter.GaussianBlur(2.0))
        rgb=np.asarray(image,dtype=float)
        output={'version':1,'image':path.name,'palette':PALETTE,'levels':{}}
        for level,columns,rows in [('easy',6,4),('medium',8,5),('hard',10,7)]:
            output['levels'][level]=build(rgb,columns,rows)
        destination=ROOT/'dist/history/regions'/f'{path.stem}.json'
        destination.write_text(json.dumps(output,separators=(',',':')),encoding='utf-8')
        print(path.stem, {key:len(value['regions']) for key,value in output['levels'].items()},flush=True)
