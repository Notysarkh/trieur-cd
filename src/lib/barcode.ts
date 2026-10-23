// Outils pour les codes-barres des CD (EAN-13, UPC-A, EAN-8).

/** Garde uniquement les chiffres. */
export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '')
}

/**
 * Vérifie la « clé de contrôle » (le dernier chiffre) d'un code EAN/UPC.
 * Une lecture ratée par la caméra donne presque toujours une clé fausse :
 * c'est notre filet de sécurité contre les erreurs de lecture.
 */
export function isValidGtin(code: string): boolean {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false
  const digits = code.split('').map(Number)
  const check = digits.pop()!
  // En partant de la droite, les chiffres sont pondérés 3, 1, 3, 1…
  let sum = 0
  digits.reverse().forEach((d, i) => {
    sum += d * (i % 2 === 0 ? 3 : 1)
  })
  return (10 - (sum % 10)) % 10 === check
}

/**
 * Forme « canonique » d'un code-barres pour comparer deux codes :
 * un UPC-A (12 chiffres, CD américains) est l'équivalent d'un EAN-13 commençant par 0.
 */
export function canonicalBarcode(raw: string): string {
  const d = digitsOnly(raw)
  if (d.length === 12) return '0' + d
  if (d.length === 14 && d.startsWith('0')) return d.slice(1)
  return d
}

/** Toutes les écritures possibles d'un même code (avec ou sans le 0 initial). */
export function barcodeVariants(raw: string): string[] {
  const c = canonicalBarcode(raw)
  const variants = new Set([c])
  if (c.length === 13 && c.startsWith('0')) variants.add(c.slice(1))
  return [...variants]
}

/** Deux codes désignent-ils le même produit ? */
export function sameBarcode(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false
  return canonicalBarcode(a) === canonicalBarcode(b)
}
