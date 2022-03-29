import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import jsPDF, { jsPDFOptions } from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist';

export interface jsPageOptions{
  format?: string | number[];
  orientation?: 'p' | 'portrait' | 'l' | 'landscape';
}

@Component({
  selector: 'app-sign-pdf',
  template: `
    <div #canvasContainer [ngStyle]="{width : width, height: height}"></div>
  `
})
export class SignPdfComponent implements OnDestroy {
  private _src?: string;

  get src(): string | undefined {
    return this._src;
  }

  @Input('src')
  set src(value: string | undefined) {
    this._src = value;
    if (this._src) {
      this.loadPdf();
    }
  }

  @Input() width: string = '100%';
  @Input() height: string = '100%';

  @Input() drawEnabled: boolean = true;
  @Input() pdfOptions?: jsPDFOptions;
  @Input() pageOptions?: jsPageOptions;

  @Output() drawEnabledChange = new EventEmitter<boolean>();
  @Output() srcChange = new EventEmitter<string>();

  @Output() saving = new EventEmitter<boolean>();
  @Output() loading = new EventEmitter<boolean>();

  @ViewChild('canvasContainer') canvasContainer?: ElementRef<HTMLDivElement>;

  private _getPdfDocumentSub?: Subscription;
  private _convertCanvasToPdfSub?: Subscription;

  constructor(private _changeDetectorRef: ChangeDetectorRef) { }

  ngOnDestroy(): void {
    this.clearCanvasContainer();
  }

  public clearCanvasContainer(): void {
    this._getPdfDocumentSub?.unsubscribe();
    this._convertCanvasToPdfSub?.unsubscribe();

    if (!this.canvasContainer) {
      return;
    }

    while (this.canvasContainer.nativeElement.firstChild) {
      const canvas = this.canvasContainer.nativeElement.firstChild;
      canvas.removeEventListener('mousedown', this.mousedown.bind(this));
      canvas.removeEventListener('mouseup', this.mouseup.bind(this));
      canvas.removeEventListener('mousemove', this.mousemove.bind(this));
      canvas.removeEventListener('touchstart', this.mousedown.bind(this));
      canvas.removeEventListener('touchend', this.mouseup.bind(this));
      canvas.removeEventListener('touchmove', this.mousemove.bind(this));
      canvas.remove();
    }
  }

  public savePdf(): void {
    this.saving.emit(true);
    this._changeDetectorRef.detectChanges();
    setTimeout((_: any) => {
      this._convertCanvasToPdfSub = this.convertCanvasToPdf().subscribe(dataUrl => {
        this.src = dataUrl.split(',')[1];
        this.srcChange.emit(this._src);
        this.saving.emit(false);
      });
    }, 100);
  }

  private loadPdf(): void {
    this.saving.emit(false);
    this.loading.emit(true);
    this.clearCanvasContainer();
    this._getPdfDocumentSub = this.getPdfDocument().subscribe(pdf => {
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        pdf.getPage(pageNumber).then((page: any) => {
          const scale = 2;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas') as HTMLCanvasElement;
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          canvas.style.marginBottom = '25px';
          canvas.style.border = '3px dashed #ccc';
          canvas.addEventListener('mousedown', this.mousedown.bind(this));
          canvas.addEventListener('mouseup', this.mouseup.bind(this));
          canvas.addEventListener('mousemove', this.mousemove.bind(this));
          canvas.addEventListener('touchstart', this.mousedown.bind(this));
          canvas.addEventListener('touchend', this.mouseup.bind(this));
          canvas.addEventListener('touchmove', this.mousemove.bind(this));

          const canvasContext = canvas.getContext('2d');
          const renderContext = {
            canvasContext,
            viewport
          };
          const renderTask = page.render(renderContext);
          renderTask.promise.then(() => {
            this.canvasContainer!.nativeElement.appendChild(canvas);
            this.loading.emit(false);
            this._changeDetectorRef.detectChanges();
          });
        });
      }
    });
  }

  private getPdfDocument(): Observable<any> {
    return new Observable<any>(observer => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.13.216/build/pdf.worker.js';
      const data = atob(this._src!);
      const loadingTask = pdfjsLib.getDocument({ data });
      loadingTask.promise.then(pdf => {
        observer.next(pdf);
        observer.complete();
        this.loading.emit(false);
      });
    });
  }

  private convertCanvasToPdf(): Observable<string> {
    return new Observable<string>(observer => {
      const newPdf = new jsPDF(this.pdfOptions);
      let index = 0;
      this.canvasContainer!.nativeElement.childNodes.forEach(child => {
        if (index > 0) {
          newPdf.addPage(this.pageOptions?.format, this.pageOptions?.orientation);
        }
        const canvas = child as HTMLCanvasElement;
        const width = newPdf.internal.pageSize.getWidth();
        const height = newPdf.internal.pageSize.getHeight();
        const pageImage = canvas.toDataURL('image/png,0.3');
        newPdf.addImage(pageImage, 'PNG', 0, 0, width, height, undefined, 'FAST');
        index++;
      });
      observer.next(newPdf.output('dataurlstring'));
      observer.complete();
    });
  }

  private mousedown(event: any) {
    if (this.drawEnabled) {
      event.target.shouldDraw = true;
      const canvas = event.target;
      const canvasContext = canvas.getContext('2d');
      canvasContext.beginPath();
      const elementRect = canvas.getBoundingClientRect();

      const clientX = event.type === 'mousedown' ? event.clientX : event.touches[0].clientX;
      const clientY = event.type === 'mousedown' ? event.clientY : event.touches[0].clientY;

      const x = canvas.width * (clientX - elementRect.left) / canvas.clientWidth;
      const y = canvas.height * (clientY - elementRect.top) / canvas.clientHeight;
      canvasContext.moveTo(x, y);
    }
  }
  private mouseup(event: any) {
    if (this.drawEnabled) {
      event.target.shouldDraw = false;
    }
  }

  private mousemove(event: any) {
    if (event.target.shouldDraw && this.drawEnabled) {
      const canvas = event.target;
      const elementRect = canvas.getBoundingClientRect();
      const canvasContext = canvas.getContext('2d');

      const clientX = event.type === 'mousemove' ? event.clientX : event.touches[0].clientX;
      const clientY = event.type === 'mousemove' ? event.clientY : event.touches[0].clientY;

      const x = canvas.width * (clientX - elementRect.left) / canvas.clientWidth;
      const y = canvas.height * (clientY - elementRect.top) / canvas.clientHeight;
      canvasContext.lineTo(x, y);
      canvasContext.stroke();
      event.preventDefault();
    }
  }

}
