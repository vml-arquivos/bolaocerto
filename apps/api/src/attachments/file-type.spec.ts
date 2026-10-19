import { detectFileType, safeFileName } from './file-type';

const pad = (b: number[]) => Buffer.from([...b, ...new Array(20).fill(0)]);

describe('detectFileType', () => {
  it('reconhece PDF, PNG, JPG e WEBP pelo conteúdo', () => {
    expect(detectFileType(Buffer.from('%PDF-1.7\n....................'))).toEqual({ mime: 'application/pdf', ext: 'pdf' });
    expect(detectFileType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.mime).toBe('image/png');
    expect(detectFileType(pad([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe('image/jpeg');
    expect(detectFileType(Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 ')]))?.mime).toBe('image/webp');
  });
  it('recusa executável, HTML, SVG e arquivo disfarçado de PDF', () => {
    expect(detectFileType(Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\x00\x00'))).toBeNull();
    expect(detectFileType(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(detectFileType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))).toBeNull();
    expect(detectFileType(Buffer.from('comprovante.pdf mas é texto simples'))).toBeNull();
    expect(detectFileType(Buffer.alloc(3))).toBeNull();
  });
});

describe('safeFileName', () => {
  it('tira caminhos e caracteres perigosos', () => {
    expect(safeFileName('../../etc/passwd', 'pdf')).toBe('passwd');
    expect(safeFileName('C:\\Users\\x\\recibo "1".pdf', 'pdf')).toBe('recibo 1.pdf');
    expect(safeFileName('a\u0000b\nc.png', 'png')).toBe('abc.png');
    expect(safeFileName('', 'pdf')).toBe('arquivo.pdf');
    expect(safeFileName('..', 'pdf')).toBe('arquivo.pdf');
    expect(safeFileName('x'.repeat(300) + '.pdf', 'pdf').length).toBeLessThanOrEqual(120);
  });
});
