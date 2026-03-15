import './style.css';

// 声明外部库
declare const Hands: any;
declare const Camera: any;

interface City {
  id: number;
  name: string;
  lng: number;
  lat: number;
}

interface GeoJsonFeature {
  geometry: {
    type: string;
    coordinates: unknown[];
  };
  properties: object;
}

interface GeoJsonData {
  features: GeoJsonFeature[];
}

class App {
  private videoElement: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private gestureStatusEl: HTMLElement;
  private albumOverlay: HTMLElement;
  private albumImage: HTMLImageElement;
  private cityNameEl: HTMLElement;
  private closeBtn: HTMLElement;

  private mapData: GeoJsonData | null = null;
  private systemScale = 1.0;
  private offsetX = 0;
  private offsetY = 0;
  private lastLeftHandPos: { x: number, y: number } | null = null;
  private visitedCities = new Set<number>();
  private cursorX = -100;
  private cursorY = -100;
  private hoverCity: City | null = null;
  private hoverStartTime = 0;
  private readonly HOVER_DURATION = 1000;
  private readonly MAP_BOUNDS = { minLng: 73.5, maxLng: 135.0, minLat: 18.0, maxLat: 53.6 };
  private camera: any = null;
  private isAlbumOpen = false;

  private readonly capitals: City[] = [
    { id: 1, name: "北京", lng: 116.40, lat: 39.90 }, { id: 2, name: "天津", lng: 117.20, lat: 39.13 },
    { id: 3, name: "石家庄", lng: 114.48, lat: 38.03 }, { id: 4, name: "太原", lng: 112.53, lat: 37.87 },
    { id: 5, name: "呼和浩特", lng: 111.65, lat: 40.82 }, { id: 6, name: "沈阳", lng: 123.38, lat: 41.80 },
    { id: 7, name: "长春", lng: 125.35, lat: 43.88 }, { id: 8, name: "哈尔滨", lng: 126.63, lat: 45.75 },
    { id: 9, name: "上海", lng: 121.47, lat: 31.23 }, { id: 10, name: "南京", lng: 118.78, lat: 32.04 },
    { id: 11, name: "杭州", lng: 120.15, lat: 30.28 }, { id: 12, name: "合肥", lng: 117.27, lat: 31.86 },
    { id: 13, name: "福州", lng: 119.30, lat: 26.08 }, { id: 14, name: "南昌", lng: 115.89, lat: 28.68 },
    { id: 15, name: "济南", lng: 117.00, lat: 36.65 }, { id: 16, name: "郑州", lng: 113.65, lat: 34.76 },
    { id: 17, name: "武汉", lng: 114.31, lat: 30.52 }, { id: 18, name: "长沙", lng: 113.00, lat: 28.21 },
    { id: 19, name: "广州", lng: 113.23, lat: 23.16 }, { id: 20, name: "南宁", lng: 108.33, lat: 22.84 },
    { id: 21, name: "海口", lng: 110.35, lat: 20.02 }, { id: 22, name: "重庆", lng: 106.54, lat: 29.59 },
    { id: 23, name: "成都", lng: 104.06, lat: 30.67 }, { id: 24, name: "贵阳", lng: 106.71, lat: 26.57 },
    { id: 25, name: "昆明", lng: 102.73, lat: 25.04 }, { id: 26, name: "拉萨", lng: 91.11, lat: 29.66 },
    { id: 27, name: "西安", lng: 108.95, lat: 34.27 }, { id: 28, name: "兰州", lng: 103.73, lat: 36.03 },
    { id: 29, name: "西宁", lng: 101.74, lat: 36.56 }, { id: 30, name: "银川", lng: 106.27, lat: 38.47 },
    { id: 31, name: "乌鲁木齐", lng: 87.68, lat: 43.77 }, { id: 32, name: "台北", lng: 121.50, lat: 25.04 },
    { id: 33, name: "香港", lng: 114.17, lat: 22.28 }, { id: 34, name: "澳门", lng: 113.54, lat: 22.19 }
  ];

  constructor() {
    this.videoElement = document.getElementById('inputVideo') as HTMLVideoElement;
    this.canvas = document.getElementById('mapCanvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.gestureStatusEl = document.getElementById('gestureStatus')!;
    this.albumOverlay = document.getElementById('albumOverlay')!;
    this.albumImage = document.getElementById('albumImage') as HTMLImageElement;
    this.cityNameEl = document.getElementById('cityName')!;
    this.closeBtn = document.getElementById('closeAlbumBtn')!;

    this.init();
  }

  private async init() {
    window.addEventListener('resize', () => this.resize());
    this.closeBtn.onclick = () => this.closeAlbum();
    
    try {
      const response = await fetch('https://geojson.cn/api/china/china.json');
      if (!response.ok) throw new Error('Network response was not ok');
      this.mapData = await response.json() as GeoJsonData;
      this.resize();
      this.setupHands();
      this.renderLoop();
      this.updateStatus("神经链路已建立");
    } catch (e) {
      console.error("初始化失败:", e);
      this.updateStatus("数据链路上行错误");
    }
  }

  private resize() {
    const scale = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * scale;
    this.canvas.height = window.innerHeight * scale;
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    this.ctx.setTransform(1, 0, 0, 1, 0, 0); // 重置变换
    this.ctx.scale(scale, scale);
  }

  private project(lng: number, lat: number, w: number, h: number) {
    const px = (lng - this.MAP_BOUNDS.minLng) / (this.MAP_BOUNDS.maxLng - this.MAP_BOUNDS.minLng) * w;
    const py = h - (lat - this.MAP_BOUNDS.minLat) / (this.MAP_BOUNDS.maxLat - this.MAP_BOUNDS.minLat) * h;
    return { x: px, y: py };
  }

  private drawMap() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.ctx.clearRect(0, 0, w, h);

    this.ctx.save();
    this.ctx.translate(w / 2 + this.offsetX, h / 2 + this.offsetY);
    this.ctx.scale(this.systemScale, this.systemScale);
    this.ctx.translate(-w / 2, -h / 2);

    const time = Date.now() * 0.002;
    
    this.drawLayer(w, h, 'rgba(255, 0, 0, 0.6)', 2, 10 + Math.sin(time)*5);
    this.drawLayer(w, h, 'rgba(255, 255, 255, 0.4)', 0.5, 2);

    let currentHover: City | null = null;
    this.capitals.forEach(city => {
      const pos = this.project(city.lng, city.lat, w, h);
      const isVisited = this.visitedCities.has(city.id);
      const breathPhase = time * 2 + city.lng * 0.5;
      const breathSize = Math.sin(breathPhase) * 1.5;
      const breathOpacity = (Math.sin(breathPhase) + 1) * 0.3 + 0.5;
      
      const mapCursorX = (this.cursorX - w/2 - this.offsetX) / this.systemScale + w/2;
      const mapCursorY = (this.cursorY - h/2 - this.offsetY) / this.systemScale + h/2;
      
      const dist = Math.hypot(pos.x - mapCursorX, pos.y - mapCursorY);
      const isTargeted = dist < 12;

      if (isTargeted) currentHover = city;

      this.ctx.beginPath();
      this.ctx.shadowBlur = (isTargeted ? 25 : 8 + breathSize * 3);
      
      if (isTargeted) {
        this.ctx.shadowColor = '#fff';
        this.ctx.fillStyle = '#fff';
      } else {
        const baseColor = isVisited ? [255, 160, 0] : [0, 255, 255]; 
        this.ctx.shadowColor = `rgb(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]})`;
        this.ctx.fillStyle = `rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, ${breathOpacity})`;
      }

      this.ctx.arc(pos.x, pos.y, isTargeted ? 5 : 2.5 + breathSize * 0.5, 0, Math.PI * 2);
      this.ctx.fill();

      if (this.systemScale > 1.2 || isTargeted) {
        this.ctx.font = isTargeted ? 'bold 12px sans-serif' : '10px sans-serif';
        this.ctx.fillStyle = isTargeted ? '#fff' : `rgba(255, 255, 255, ${breathOpacity})`;
        this.ctx.fillText(city.name, pos.x + 10, pos.y + 5);
      }
    });

    this.updateHoverTimer(currentHover);
    this.ctx.restore();
    this.drawCursor();
  }

  private updateHoverTimer(city: City | null) {
    if (city && !this.isAlbumOpen) {
      if (this.hoverCity !== city) {
        this.hoverCity = city;
        this.hoverStartTime = Date.now();
      } else {
        const elapsed = Date.now() - this.hoverStartTime;
        if (elapsed >= this.HOVER_DURATION) {
          this.openAlbum(city);
          this.visitedCities.add(city.id);
          this.hoverCity = null;
          this.hoverStartTime = 0;
        }
      }
    } else {
      this.hoverCity = null;
      this.hoverStartTime = 0;
    }
  }

  private drawCursor() {
    if (this.cursorX < 0 || this.cursorY < 0) return;
    this.ctx.save();
    this.ctx.translate(this.cursorX, this.cursorY);
    this.ctx.strokeStyle = '#00ffff';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath(); this.ctx.arc(0, 0, 15, 0, Math.PI * 2); this.ctx.stroke();
    
    for(let i=0; i<4; i++){
      this.ctx.rotate(Math.PI/2);
      this.ctx.beginPath(); this.ctx.moveTo(12, 0); this.ctx.lineTo(18, 0); this.ctx.stroke();
    }

    if (this.hoverCity) {
      const progress = (Date.now() - this.hoverStartTime) / this.HOVER_DURATION;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, 22, -Math.PI/2, -Math.PI/2 + Math.PI*2 * progress);
      this.ctx.strokeStyle = '#ff3333';
      this.ctx.lineWidth = 4;
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  private drawLayer(width: number, height: number, color: string, lw: number, blur: number, alpha = 1) {
    this.ctx.save();
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lw;
    this.ctx.shadowBlur = blur;
    this.ctx.shadowColor = color;
    this.ctx.globalAlpha = alpha;
    this.ctx.lineJoin = 'round';
    if (this.mapData) {
      this.mapData.features.forEach((f: GeoJsonFeature) => {
        this.ctx.beginPath();
        const coords = f.geometry.coordinates;
        if (f.geometry.type === 'Polygon') this.renderRings(coords as unknown[][], width, height);
        else coords.forEach((poly: unknown) => this.renderRings(poly as unknown[][], width, height));
        this.ctx.stroke();
      });
    }
    this.ctx.restore();
  }

  private renderRings(rings: unknown[][], w: number, h: number) {
    rings.forEach(ring => {
      (ring as unknown[]).forEach((c: unknown, i: number) => {
        const p = this.project((c as number[])[0], (c as number[])[1], w, h);
        if (i === 0) this.ctx.moveTo(p.x, p.y);
        else this.ctx.lineTo(p.x, p.y);
      });
    });
  }

  private setupHands() {
    const hands = new Hands({locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
    hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 });
    hands.onResults((results: any) => this.onResults(results));
    this.camera = new Camera(this.videoElement, { onFrame: async () => await hands.send({image: this.videoElement}), width: 1280, height: 720 });
    this.camera.start();
  }

  private onResults(results: any) {
    let leftHand: any = null, rightHand: any = null;
    if (results.multiHandLandmarks && results.multiHandedness) {
      results.multiHandLandmarks.forEach((lm: any, index: number) => {
        const label = results.multiHandedness[index].label; 
        if (label === 'Left') rightHand = lm; else leftHand = lm;
      });
    }
    const w = window.innerWidth;
    const h = window.innerHeight;

    // 右手逻辑：控制光标与缩放/关闭
    if (rightHand) {
      const indexTip = rightHand[8];
      this.cursorX = (1 - indexTip.x) * w;
      this.cursorY = indexTip.y * h;

      const isOpen = this.checkIsOpen(rightHand);
      const isFist = this.checkIsFist(rightHand);

      if (this.isAlbumOpen) {
        if (isFist) {
          this.closeAlbum();
          this.updateStatus("相册已关闭");
        } else {
          this.updateStatus("握拳可关闭相册");
        }
      } else {
        if (isOpen) {
          this.systemScale = Math.min(4.0, this.systemScale + 0.03);
          this.updateStatus("放大视图");
        } else if (isFist) {
          this.systemScale = Math.max(0.5, this.systemScale - 0.03);
          this.updateStatus("缩小视图");
        } else {
          this.updateStatus("锁定目标点");
        }
      }
    } else { this.cursorX = -100; this.cursorY = -100; }

    // 左手逻辑：平移
    if (leftHand && this.checkIsOpen(leftHand)) {
      const center = leftHand[9];
      if (this.lastLeftHandPos) {
        this.offsetX += (center.x - this.lastLeftHandPos.x) * -2000;
        this.offsetY += (center.y - this.lastLeftHandPos.y) * 2000;
        this.updateStatus("视图移动中");
      }
      this.lastLeftHandPos = center;
    } else { this.lastLeftHandPos = null; }
    
    if (!rightHand && !leftHand) this.updateStatus("神经链路等待输入");
  }

  private checkIsOpen(lm: any) { return lm[8].y < lm[6].y && lm[12].y < lm[10].y && lm[16].y < lm[14].y && lm[20].y < lm[18].y; }
  private checkIsFist(lm: any) { return lm[8].y > lm[6].y && lm[12].y > lm[10].y && lm[16].y > lm[14].y && lm[20].y > lm[18].y; }

  private openAlbum(city: City) {
    this.isAlbumOpen = true;
    this.cityNameEl.textContent = city.name;
    this.albumImage.src = `https://picsum.photos/seed/${city.name}/1200/800`;
    this.albumOverlay.classList.add('active');
  }

  private closeAlbum() {
    this.isAlbumOpen = false;
    this.albumOverlay.classList.remove('active');
  }

  private updateStatus(status: string) {
    this.gestureStatusEl.textContent = status;
  }

  private renderLoop() {
    this.drawMap();
    requestAnimationFrame(() => this.renderLoop());
  }
}

new App();
