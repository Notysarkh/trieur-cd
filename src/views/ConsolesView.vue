<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Platform } from '../db/types'
import { byMaker, PLATFORMS, platformLabel } from '../lib/platforms'
import { setMyPlatforms } from '../services/classification'
import { settings } from '../services/settings'

// « Mes consoles » : les consoles dont tu as des jeux, dans l'ordre de rangement.
// Demandé à la première ouverture de l'univers Jeux vidéo (chaque personne a ses propres consoles),
// puis modifiable à tout moment depuis « Thèmes et règles ».
// Chaque console choisie devient un thème ; les jeux des autres consoles vont dans « Autres consoles ».

const route = useRoute()
const router = useRouter()
const firstTime = !settings.platformsSetupDone
const chosen = ref<Platform[]>(firstTime ? [] : [...settings.myPlatforms])
const available = computed(() => byMaker(PLATFORMS.filter((p) => p.id !== 'autre' && !chosen.value.includes(p.id))))

function add(id: Platform) {
  chosen.value.push(id)
}
function remove(i: number) {
  chosen.value.splice(i, 1)
}
function move(i: number, delta: number) {
  const j = i + delta
  if (j < 0 || j >= chosen.value.length) return
  const [p] = chosen.value.splice(i, 1)
  chosen.value.splice(j, 0, p)
}

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    await setMyPlatforms([...chosen.value])
    const next = typeof route.query.suite === 'string' && route.query.suite !== '/consoles' ? route.query.suite : '/collection'
    await router.replace(next)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="page stack">
    <RouterLink v-if="!firstTime" to="/classement/themes" class="small">← Retour aux thèmes</RouterLink>
    <h1>🎮 Mes consoles</h1>
    <p v-if="firstTime" class="notice">
      Bienvenue dans les jeux vidéo ! Choisis d'abord les consoles dont tu as des jeux : chacune aura sa place dans le
      classement et dans tes meubles, dans l'ordre que tu choisis. Tu pourras changer ce réglage plus tard (Classement →
      Thèmes et règles).
    </p>
    <p v-else class="small muted">
      Chaque console de la liste a sa place dans le classement, dans cet ordre. Les jeux des autres consoles vont dans
      « Autres consoles ».
    </p>

    <section class="card stack">
      <h2>Ordre de rangement</h2>
      <p v-if="!chosen.length" class="muted small">Aucune console pour l'instant : touche celles que tu possèdes ci-dessous.</p>
      <ol class="chosen">
        <li v-for="(id, i) in chosen" :key="id" class="row">
          <span class="badge badge-info">{{ i + 1 }}</span>
          <strong class="grow">{{ platformLabel(id) }}</strong>
          <button class="btn btn-small" :disabled="i === 0" :aria-label="`Monter ${platformLabel(id)}`" @click="move(i, -1)">↑</button>
          <button class="btn btn-small" :disabled="i === chosen.length - 1" :aria-label="`Descendre ${platformLabel(id)}`" @click="move(i, 1)">↓</button>
          <button class="btn btn-small btn-danger" :aria-label="`Retirer ${platformLabel(id)}`" @click="remove(i)">✕</button>
        </li>
      </ol>
    </section>

    <section class="card stack">
      <h2>Ajouter une console</h2>
      <div v-for="g in available" :key="g.maker" class="group">
        <h3 class="small muted">{{ g.maker }}</h3>
        <div class="choices">
          <button v-for="p in g.platforms" :key="p.id" class="chip" @click="add(p.id)">+ {{ p.label }}</button>
        </div>
      </div>
    </section>

    <button class="btn btn-primary btn-big" :disabled="!chosen.length || saving" @click="save">
      <template v-if="!chosen.length">Choisis au moins une console</template>
      <template v-else-if="chosen.length === 1">✓ Valider ma console</template>
      <template v-else>✓ Valider mes {{ chosen.length }} consoles</template>
    </button>
  </main>
</template>

<style scoped>
.chosen {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.chosen li {
  flex-wrap: nowrap;
}
.group h3 {
  margin: 0 0 4px;
  font-weight: 600;
}
.choices {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
