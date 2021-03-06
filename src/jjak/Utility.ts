/**
 * Jjoriping's JJAK Logger
 * 
 * https://github.com/JJoriping/JJWAK
 */
import { DateUnit } from "./DateUnit";

/**
 * 프론트엔드 여부.
 */
export const FRONT:boolean = Boolean(false);
/**
 * 유효한 단일 샤프 인자의 집합.
 */
export const REGEXP_LANGUAGE_ARGS = /\{#(\d+?)\}/g;
/**
 * 시간대 오프셋 값(㎳).
 */
export const TIMEZONE_OFFSET = new Date().getTimezoneOffset() * DateUnit.MINUTE;
/**
 * 제한 길이를 초과하는 내용이 생략된 문자열을 반환한다.
 *
 * @param text 대상 문자열.
 * @param limit 제한 길이.
 */
export function cut(text:string, limit:number):string{
  return text.length > limit
    ? text.slice(0, limit - 1) + "…"
    : text
  ;
}
/**
 * 대상 객체의 엔트리 일부만 갖는 객체를 반환한다.
 *
 * @param object 대상 객체.
 * @param keys 선택할 키.
 */
export function pick<T, U extends keyof T>(object:T, ...keys:U[]):Pick<T, U>{
  return keys.reduce<Pick<T, U>>((pv, v) => {
    if(v in object){
      pv[v] = object[v];
    }
    return pv;
  }, {} as any);
}
/**
 * 배열을 주어진 함수에 따라 딕셔너리로 바꾸어 반환한다.
 *
 * @param target 대상 배열.
 * @param placer 값을 반환하는 함수.
 * @param keyPlacer 키를 반환하는 함수.
 */
export function reduceToTable<T, U, V extends number|string>(
  target:T[],
  placer:(v:T, i:number, my:T[]) => U,
  keyPlacer?:(v:T, i:number, my:T[]) => V
):{ [key in V]: U }{
  return target.reduce(keyPlacer
    ? (pv, v, i, my) => {
      pv[keyPlacer(v, i, my)] = placer(v, i, my);
      return pv;
    }
    : (pv, v, i, my) => {
      pv[String(v) as V] = placer(v, i, my);
      return pv;
    }
  , {} as { [key in V]: U });
}
/**
 * 문자열 내 단일 샤프 인자들을 추가 정보로 대체시켜 반환한다.
 *
 * @param text 입력 문자열.
 * @param args 추가 정보.
 */
export function resolveLanguageArguments(text:string, ...args:any[]):string{
  return text.replace(REGEXP_LANGUAGE_ARGS, (_, v1) => args[v1]);
}
/**
 * 주어진 수가 0보다 크면 + 기호를 붙여 반환한다.
 * 
 * @param value 대상.
 */
export function toSignedString(value:number):string{
  return (value > 0 ? "+" : "") + value;
}