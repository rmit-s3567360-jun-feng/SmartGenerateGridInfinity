declare module '@jscad/3mf-serializer' {
  export interface Serialize3mfOptions {
    unit?: 'millimeter' | 'inch' | 'feet' | 'meter' | 'micrometer'
    metadata?: boolean
    defaultcolor?: [number, number, number, number]
    compress?: boolean
  }

  export function serialize(
    options?: Serialize3mfOptions & { compress?: true },
    ...objects: unknown[]
  ): ArrayBuffer[]

  export function serialize(
    options: Serialize3mfOptions & { compress: false },
    ...objects: unknown[]
  ): string[]
}
