declare module '@jscad/stl-serializer' {
  export function serialize(
    options: { binary?: boolean; statusCallback?: (status: number) => void },
    ...objects: unknown[]
  ): ArrayBuffer[]
}
