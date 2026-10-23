import { liveQuery } from 'dexie'
import { onScopeDispose, shallowRef, type Ref } from 'vue'

/**
 * Lit la base et se met à jour tout seul à chaque modification
 * (ex. : un CD identifié en arrière-plan apparaît immédiatement dans la liste).
 */
export function useLiveQuery<T>(query: () => T | Promise<T>, initial: T): Ref<T> {
  const result = shallowRef(initial) as Ref<T>
  const subscription = liveQuery(query).subscribe({
    next: (value) => (result.value = value),
    error: (e) => console.error('Lecture de la base impossible', e),
  })
  onScopeDispose(() => subscription.unsubscribe())
  return result
}
