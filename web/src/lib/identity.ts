// 无登录:身份就是「当前选中的用户 id」,存 localStorage。
const KEY = 'helio.userId'

export function getUserId(): string | null {
  return localStorage.getItem(KEY)
}

export function setUserId(id: string) {
  localStorage.setItem(KEY, id)
}
