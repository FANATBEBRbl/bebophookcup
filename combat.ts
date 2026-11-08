import { Buttons, type Player } from 'modlock'

const hookCooldownSeconds = 3
const abilityButtons = [Buttons.ability1, Buttons.ability2, Buttons.ability3, Buttons.ultimate]
export function restrictCombat(player: Player, now: number, lockHook = false): void {
  const abilities = player.abilities()
  const carpet = abilities.find(a => a.name === 'upgrade_magic_carpet')
  const hook = abilities.find((a) => a.name === 'citadel_ability_hook')
  let blocked = Buttons.attack | Buttons.altFire | Buttons.reload | Buttons.melee | Buttons.parry
  for (let slot = 0; slot < 4; slot++) if (lockHook || !hook || slot !== hook.slot) blocked |= abilityButtons[slot]
  if (carpet) {
    // Deadlock maps active slots 4..7 onto IN_ITEM1..4 (bits 37..40).
    if (carpet.slot >= 4 && carpet.slot <= 7) blocked |= 1n << BigInt(37 + carpet.slot - 4)
    if (carpet.cooldownEnd < now + 30) player.setAbility({ ability: carpet.name, cooldownEnd: now + 60 })
  }
  player.blockInput(blocked)
  if (!hook) return
  if ((hook.upgrades & 15) !== 15) player.setAbility({ ability: hook.name, upgrades: 15 })
  // Same cooldown fields used by Modlock's Hook helper.
  if (!lockHook && hook.cooldownEnd > now && hook.cooldownEnd !== hook.cooldownStart + hookCooldownSeconds) {
    player.setAbility({ ability: hook.name, cooldownEnd: hook.cooldownStart + hookCooldownSeconds })
  }
}
