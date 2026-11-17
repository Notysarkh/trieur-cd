// Saisons d'un coffret de série : « 1, 2, 3, 5 » → « saisons 1 à 3 et 5 ».

/** Les saisons regroupées en suites : [1,2,3,5] → « 1 à 3, 5 ». */
export function seasonsText(seasons: number[]): string {
  const s = [...new Set(seasons)].filter((n) => n >= 0).sort((a, b) => a - b)
  const parts: string[] = []
  for (let i = 0; i < s.length; ) {
    let j = i
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++
    const from = s[i] === 0 ? 'épisodes spéciaux' : String(s[i])
    parts.push(j - i >= 2 ? `${from} à ${s[j]}` : j === i ? from : `${from}, ${s[j]}`)
    i = j + 1
  }
  return parts.join(', ')
}

/** Libellé court : « saison 2 » / « saisons 1 à 3, 5 ». */
export function seasonsLabel(seasons: number[]): string {
  const n = seasons.filter((x) => x > 0).length
  return `${n > 1 ? 'saisons' : 'saison'} ${seasonsText(seasons)}`
}

/** Le texte d'une saison pour la liste du coffret (sert aussi à la recherche). */
export function seasonContent(series: string, n: number): string {
  return n === 0 ? `${series} — épisodes spéciaux` : `${series} — saison ${n}`
}
