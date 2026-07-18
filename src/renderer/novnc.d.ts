declare module '@novnc/novnc' {
  export default class RFB {
    constructor(
      target: HTMLElement,
      url: string,
      options?: { credentials?: { username?: string; password?: string } }
    )
    viewOnly: boolean
    scaleViewport: boolean
    clipViewport: boolean
    resizeSession: boolean
    qualityLevel: number
    compressionLevel: number
    background: string
    focusOnClick: boolean
    disconnect(): void
    addEventListener(type: string, listener: (event: Event) => void): void
  }
}
