/**
 * QR code generation.
 *
 * Error correction defaults to 'M'. Level 'H' survives more damage but spends a
 * quarter of the symbol on redundancy, which makes the modules smaller at a fixed
 * print size -- and a printed invitation sitting on a mantelpiece is not a damaged
 * label on a shipping crate. 'M' with a decent quiet zone scans more reliably here.
 */
import QRCode from 'qrcode';
import type { QRCodeErrorCorrectionLevel } from 'qrcode';

export interface QrOptions {
	/** Pixel width for the PNG; ignored by the SVG, which scales freely. */
	size?: number;
	errorCorrectionLevel?: QRCodeErrorCorrectionLevel;
	/** Quiet-zone width in modules. Below 4 the scan rate drops noticeably. */
	margin?: number;
	dark?: string;
	light?: string;
}

function toQrOptions(options: QrOptions) {
	return {
		errorCorrectionLevel: options.errorCorrectionLevel ?? ('M' as QRCodeErrorCorrectionLevel),
		margin: options.margin ?? 4,
		width: options.size ?? 512,
		color: {
			dark: options.dark ?? '#000000',
			light: options.light ?? '#FFFFFF'
		}
	};
}

export async function qrPng(text: string, options: QrOptions = {}): Promise<Buffer> {
	return QRCode.toBuffer(text, { type: 'png', ...toQrOptions(options) });
}

export async function qrSvg(text: string, options: QrOptions = {}): Promise<string> {
	return QRCode.toString(text, { type: 'svg', ...toQrOptions(options) });
}

export async function qrDataUrl(text: string, options: QrOptions = {}): Promise<string> {
	return QRCode.toDataURL(text, toQrOptions(options));
}
