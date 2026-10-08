declare module 'path' {
  const path: {
    resolve(...pathSegments: string[]): string
    join(...paths: string[]): string
    dirname(p: string): string
    basename(p: string, ext?: string): string
    extname(p: string): string
  }
  export default path
}

declare module 'fs' {
  export function readFileSync(path: string, options?: { encoding?: string; flag?: string } | string): string
  export function writeFileSync(path: string, data: string | Uint8Array, options?: { encoding?: string; mode?: number; flag?: string } | string): void
  export function existsSync(path: string): boolean
  export function mkdirSync(path: string, options?: { recursive?: boolean; mode?: number }): string | undefined
}
