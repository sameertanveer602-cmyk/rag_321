declare module 'pdf-poppler' {
  interface ConvertOptions {
    format: 'jpeg' | 'png' | 'tiff' | 'ps' | 'eps' | 'svg';
    out_dir: string;
    out_prefix?: string;
    page?: number;
    first_page?: number;
    last_page?: number;
    scale?: number;
    density?: number;
    crop_x?: number;
    crop_y?: number;
    crop_w?: number;
    crop_h?: number;
  }

  interface ConvertResult {
    name: string;
    size: number;
    path: string;
    page: number;
  }

  export function convert(pdfPath: string, options: ConvertOptions): Promise<ConvertResult[]>;
}