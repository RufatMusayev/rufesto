// Tiny debounce used to collapse realtime refetch storms (multiple
// postgres_changes events firing in quick succession) into a single reload.
export function debounce(fn, wait = 400) {
  let timer = null
  const debounced = (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }
  debounced.cancel = () => clearTimeout(timer)
  return debounced
}
