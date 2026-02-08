import { Component, ElementRef, Input, ViewChild, AfterViewInit, OnChanges } from '@angular/core';
import * as QRCode from 'qrcode';

@Component({
  selector: 'app-qr-code',
  standalone: true,
  imports: [],
  template: '<canvas #qrCanvas></canvas>',
  styleUrl: './qr-code.component.scss'
})
export class QrCodeComponent implements AfterViewInit, OnChanges {
  @ViewChild('qrCanvas', { static: false }) canvas!: ElementRef<HTMLCanvasElement>;
  @Input() value: string = '';
  @Input() size: number = 250;

  ngAfterViewInit(): void {
    this.generateQRCode();
  }

  ngOnChanges(): void {
    if (this.canvas) {
      this.generateQRCode();
    }
  }

  private async generateQRCode(): Promise<void> {
    if (!this.value || !this.canvas) return;

    try {
      await QRCode.toCanvas(this.canvas.nativeElement, this.value, {
        width: this.size,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
    } catch (error) {
      console.error('Error generating QR code:', error);
    }
  }
}
