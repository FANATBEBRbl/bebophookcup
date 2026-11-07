import { Buttons, type Player } from 'modlock'

const hookCooldownSeconds = 3
const abilityButtons = [Buttons.ability1, Buttons.ability2, Buttons.ability3, Buttons.ultimate]
export function restrictCombat(player: Player, now: number): void {
  const hook = player.abilities().find((a) => a.name === 'citadel_ability_hook')
  let blocked = Buttons.attack | Buttons.altFire | Buttons.reload | Buttons.melee | Buttons.parry
  for (let slot = 0; slot < 4; slot++) if (!hook || slot !== hook.slot) blocked |= abilityButtons[slot]
  player.blockInput(blocked)
  if (!hook) return
  if ((hook.upgrades & 15) !== 15) player.setAbility({ ability: hook.name, upgrades: 15 })
  // Same cooldown fields used by Modlock's Hook helper.
  if (hook.cooldownEnd > now && hook.cooldownEnd !== hook.cooldownStart + hookCooldownSeconds) {
    player.setAbility({ ability: hook.name, cooldownEnd: hook.cooldownStart + hookCooldownSeconds })
  }
}
