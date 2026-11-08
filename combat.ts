import { Buttons, type Player } from 'modlock'

const hookCooldownSeconds = 3
const abilityButtons = [Buttons.ability1, Buttons.ability2, Buttons.ability3, Buttons.ultimate]
export function restrictCombat(player: Player, now: number, lockHook = false): void {
  const abilities = player.abilities()
  const hook = abilities.find((a) => a.name === 'citadel_ability_hook')
  let blocked = Buttons.attack | Buttons.altFire | Buttons.reload | Buttons.melee
  for (let slot = 0; slot < 4; slot++) if (lockHook || !hook || slot !== hook.slot) blocked |= abilityButtons[slot]
  for (const ability of abilities) {
    if (ability.slot >= 0 && ability.slot <= 3 && ability.name && ability !== hook && ability.upgrades > 0) {
      player.setAbility({ ability: ability.name, upgrades: 0 })
    }
  }
  const counterspell = abilities.find(a => a.name === 'upgrade_counterspell')
  if (lockHook || !counterspell) blocked |= Buttons.parry
  if (counterspell && counterspell.cooldownEnd > now &&
      Math.abs(counterspell.cooldownEnd - (counterspell.cooldownStart + 30)) > 0.01) {
    player.setAbility({ ability: counterspell.name, cooldownEnd: counterspell.cooldownStart + 30 })
  }
  player.blockInput(blocked)
  if (!hook) return
  if ((hook.upgrades & 15) !== 15) player.setAbility({ ability: hook.name, upgrades: 15 })
  // Same cooldown fields used by Modlock's Hook helper.
  if (!lockHook && hook.cooldownEnd > now && hook.cooldownEnd !== hook.cooldownStart + hookCooldownSeconds) {
    player.setAbility({ ability: hook.name, cooldownEnd: hook.cooldownStart + hookCooldownSeconds })
  }
}
