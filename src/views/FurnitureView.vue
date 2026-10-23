<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { newId } from '../db/database'
import {
  furnitureCapacity,
  furnitureFromModel,
  furnitureWarnings,
  MODELS,
  type Furniture,
} from '../layout/furniture'
import { saveSetting, settings } from '../services/settings'

// Configurateur de meubles : dimensions, nombre de niveaux, double rangée, cases réservées, ordre de remplissage.
// Chaque modification est enregistrée immédiatement.

const list = reactive<Furniture[]>(JSON.parse(JSON.stringify(settings.furniture)))
watch(
  () => settings.furniture,
  (f) => list.splice(0, list.length, ...JSON.parse(JSON.stringify(f))),
)
function commit() {
  for (const f of list) {
    // Valeurs raisonnables, même si un champ a été vidé.
    f.levels = Math.min(30, Math.max(1, Math.round(Number(f.levels) || 1)))
    f.columns = Math.min(10, Math.max(1, Math.round(Number(f.columns) || 1)))
    f.innerWidthCm = Math.max(1, Number(f.innerWidthCm) || 1)
    f.innerHeightCm = Math.max(1, Number(f.innerHeightCm) || 1)
    f.depthCm = Math.max(1, Number(f.depthCm) || 1)
    f.reserved = f.reserved.filter((k) => {
      const [l, c] = k.split('-').map(Number)
      return l <= f.levels && c <= f.columns
    })
  }
  return saveSetting('furniture', JSON.parse(JSON.stringify(list)))
}

const total = computed(() =>
  list.reduce((sum, f) => sum + furnitureCapacity(f).standardCds, 0),
)

function move(i: number, delta: number) {
  const j = i + delta
  if (j < 0 || j >= list.length) return
  const [f] = list.splice(i, 1)
  list.splice(j, 0, f)
  void commit()
}

function remove(f: Furniture) {
  if (!window.confirm(`Retirer « ${f.name} » ? Les CD qui y étaient seront répartis ailleurs au prochain calcul.`)) return
  list.splice(list.indexOf(f), 1)
  void commit()
}

const modelKey = ref(MODELS[1].key)
function add() {
  const model = MODELS.find((m) => m.key === modelKey.value)!
  const f = furnitureFromModel(model, newId())
  // Nom unique : « Billy », « Billy 2 »…
  let name = model.name
  for (let k = 2; list.some((x) => x.name === name); k++) name = `${model.name} ${k}`
  f.name = name
  list.push(f)
  void commit()
}

function toggleCase(f: Furniture, level: number, column: number) {
  const key = `${level}-${column}`
  f.reserved = f.reserved.includes(key) ? f.reserved.filter((k) => k !== key) : [...f.reserved, key]
  void commit()
}

const modelNote = computed(() => MODELS.find((m) => m.key === modelKey.value)?.note)
</script>

<template>
  <main class="page stack">
    <RouterLink to="/rangement" class="small">← Retour au rangement</RouterLink>
    <h1>Mes meubles</h1>
    <p class="small muted">
      Les meubles sont remplis dans l'ordre de cette liste (le premier d'abord), puis de haut en bas et de gauche à
      droite. Capacité totale : environ <strong>{{ total }} CD standard</strong>.
    </p>

    <section v-for="(f, i) in list" :key="f.id" class="card stack">
      <div class="row">
        <span class="badge badge-info">{{ i + 1 }}</span>
        <input v-model="f.name" class="grow name" :aria-label="`Nom du meuble ${i + 1}`" @change="commit" />
        <button class="btn btn-small" :disabled="i === 0" aria-label="Remplir avant" @click="move(i, -1)">↑</button>
        <button class="btn btn-small" :disabled="i === list.length - 1" aria-label="Remplir après" @click="move(i, 1)">↓</button>
      </div>
      <p class="small muted">
        Modèle : {{ f.model }} · {{ furnitureCapacity(f).perRow }} CD standard par rangée ·
        <strong>≈ {{ furnitureCapacity(f).standardCds }} CD</strong> au total
      </p>

      <div class="form-grid">
        <label class="field">
          Niveaux (tablettes)
          <input v-model.number="f.levels" type="number" min="1" max="30" @change="commit" />
        </label>
        <label class="field">
          Cases par niveau
          <input v-model.number="f.columns" type="number" min="1" max="10" @change="commit" />
        </label>
        <label class="field">
          Largeur utile d'une case (cm)
          <input v-model.number="f.innerWidthCm" type="number" step="0.5" min="1" @change="commit" />
        </label>
        <label class="field">
          Hauteur utile d'une case (cm)
          <input v-model.number="f.innerHeightCm" type="number" step="0.5" min="1" @change="commit" />
        </label>
        <label class="field">
          Profondeur utile (cm)
          <input v-model.number="f.depthCm" type="number" step="0.5" min="1" @change="commit" />
        </label>
        <label class="field">
          Rangées en profondeur
          <select v-model.number="f.depthRows" @change="commit">
            <option :value="1">1 rangée</option>
            <option :value="2">2 rangées (devant + derrière)</option>
          </select>
        </label>
        <label class="field">
          Couches en hauteur
          <select v-model.number="f.layers" @change="commit">
            <option :value="1">1 couche</option>
            <option :value="2">2 couches (avec plateau intermédiaire)</option>
          </select>
        </label>
      </div>

      <ul v-if="furnitureWarnings(f).length" class="warnings small">
        <li v-for="w in furnitureWarnings(f)" :key="w">⚠️ {{ w }}</li>
      </ul>

      <div>
        <p class="small muted label">
          Cases utilisées pour les CD (décoche celles réservées à autre chose : livres, déco…)
        </p>
        <div class="cases" :style="{ gridTemplateColumns: `repeat(${f.columns}, minmax(0, 1fr))` }">
          <template v-for="level in f.levels" :key="level">
            <label v-for="column in f.columns" :key="`${level}-${column}`" class="case" :class="{ off: f.reserved.includes(`${level}-${column}`) }">
              <input
                type="checkbox"
                :checked="!f.reserved.includes(`${level}-${column}`)"
                @change="toggleCase(f, level, column)"
              />
              <span>Niv. {{ level }}<template v-if="f.columns > 1"> · case {{ column }}</template></span>
            </label>
          </template>
        </div>
      </div>

      <button class="btn btn-small btn-danger remove" @click="remove(f)">Retirer ce meuble</button>
    </section>

    <section class="card stack">
      <h2>Ajouter un meuble</h2>
      <div class="row">
        <select v-model="modelKey" class="grow" aria-label="Modèle">
          <option v-for="m in MODELS" :key="m.key" :value="m.key">{{ m.model }}</option>
        </select>
        <button class="btn btn-primary" @click="add">+ Ajouter</button>
      </div>
      <p class="small muted">{{ modelNote }} Toutes les dimensions restent modifiables après l'ajout.</p>
    </section>
  </main>
</template>

<style scoped>
.name {
  font-weight: 600;
  min-width: 0;
}
.warnings {
  margin: 0;
  padding: 10px 12px 10px 28px;
  border-radius: 10px;
  background: var(--warn-bg);
  color: var(--warn);
}
.label {
  margin: 0 0 6px;
}
.cases {
  display: grid;
  gap: 4px;
}
.case {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 0.8rem;
  background: var(--surface-2);
  cursor: pointer;
}
.case input {
  width: 18px;
  height: 18px;
}
.case.off {
  background: repeating-linear-gradient(45deg, transparent 0 6px, var(--border) 6px 8px);
  color: var(--muted);
}
.remove {
  align-self: flex-start;
}
</style>
