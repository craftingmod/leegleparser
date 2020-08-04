export class SplitElement {
  public readonly startTime:number
  public readonly endTime:number
  public readonly title:string
  public readonly index:number
  public readonly noEnd:boolean
  public get start() {
    return this.toDateString(this.startTime)
  }
  public get end() {
    return this.toDateString(this.endTime)
  }
  public get delta() {
    return this.toDateString(this.endTime - this.startTime)
  }

  public constructor(start:number, end:number, _title:string, _index:number) {
    this.startTime = start
    this.endTime = Math.max(0, end)
    this.title = _title
    this.index = _index
    this.noEnd = end <= 0
  }
  public toString():string {
    return `SplitElement(index=${this.index},duration=${
      this.start
    }~${
      this.noEnd ? "end" : this.end
    }, title=${this.title})`
  }
  private toDateString(time:number) {
    const hour = Math.floor(time / 3600)
    const minute = Math.floor((time % 3600) / 60)
    const second = time % 60

    const dateString = `${
      hour.toString().padStart(2, "0")
    }:${
      minute.toString().padStart(2, "0")
    }:${
      second.toString().padStart(2, "0")
    }`
    return dateString
  }
}