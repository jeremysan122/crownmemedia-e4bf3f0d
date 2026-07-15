# -*- coding: utf-8 -*-
"""
Per-crown prompt specifications for the 100-crown CrownMe achievement catalog.

The uploaded 100-crown contact sheet is used ONLY as a visual reference for
silhouette, material, gem color and theme. Each crown is generated
INDEPENDENTLY at 2048x2048 with a true alpha channel. No crops are enlarged
and no backgrounds are removed from the sheet.

`crown-001` through `crown-010`  Origin (universal fleur-de-lis, warm gold -> cool sapphire progression)
`crown-011` through `crown-020`  Battle Champion (aggressive spikes, wings, ruby/red)
`crown-021` through `crown-030`  Crown Hoarder (ornate multi-band, sapphire/blue)
`crown-031` through `crown-040`  Social Sovereign (starlike halo cluster, amethyst/purple)
`crown-041` through `crown-050`  Content Crown (broadcast/CRT-influenced, teal/cyan)
`crown-051` through `crown-060`  Streak Sovereign (flame spikes, molten gold and ember red)
`crown-061` through `crown-070`  Gilded Patron (deep rose-gold with pearls and emerald)
`crown-071` through `crown-080`  Arena Sage (orbital rings, celestial, cosmic blue-violet)
`crown-081` through `crown-090`  Tournament Titan (winged, twin-lion horns, imperial gold)
`crown-091` through `crown-100`  Legendary (halo/planet/nova, prismatic, mythic)

Tier progression (1..10 -> spark/ember/flame/blaze/ascendant/radiant/sovereign/regent/imperial/eternal):
  1-2  small, humble, single gem
  3-4  taller, more spikes, richer materials
  5-6  ornate, multi-gem
  7-8  wings/side extensions, epic glow
  9    imperial: dominant crown with side extensions and radiant glow
  10   eternal: mythic, cosmic effects, particles, dramatic light
"""

COLLECTIONS = {
    "origin":         {"palette": "gold moving to silver-and-sapphire", "gems": "sapphire, ruby, emerald, diamond accents", "motif": "royal fleur-de-lis silhouette"},
    "battler":        {"palette": "gold with deep ruby",                 "gems": "ruby, garnet, obsidian",                 "motif": "aggressive tall spikes and razor edges, small wings on higher tiers"},
    "crown_hoarder":  {"palette": "silver-white and sapphire",           "gems": "sapphire, aquamarine, diamond",           "motif": "multi-band ornate stacked crown"},
    "social":         {"palette": "purple with silver",                  "gems": "amethyst, purple sapphire, moonstone",   "motif": "halo of five-point stars ringing the crown"},
    "creator":        {"palette": "gold with teal and cyan",             "gems": "aquamarine, teal topaz",                 "motif": "broadcast waves and CRT arcs woven into the metalwork"},
    "streak":         {"palette": "molten gold and ember red",           "gems": "fire opal, ruby, citrine",               "motif": "flame-shaped spikes and glowing ember tips"},
    "gifter":         {"palette": "deep rose-gold with pearl accents",   "gems": "emerald, pearl, pink tourmaline",        "motif": "ornate filigree, pearl inlays, delicate side extensions"},
    "spectator":      {"palette": "cosmic blue-violet and silver",       "gems": "labradorite, star sapphire, moonstone", "motif": "orbital rings and a small planet motif at higher tiers"},
    "tournament":     {"palette": "imperial gold",                       "gems": "ruby, diamond, imperial topaz",          "motif": "large lion-horn side extensions and gilded eagle wings"},
    "legend":         {"palette": "prismatic gold-platinum",             "gems": "diamond, mythic prismatic gem",          "motif": "halo, nova bursts, orbital planet or supernova at highest tiers"},
}

TIER_MODIFIERS = {
    1:  "small humble crown with a single center gem, three modest spikes, delicate metalwork, gentle glow",
    2:  "slightly larger crown with two gems and five spikes, refined metalwork, warm rim light",
    3:  "taller crown with more ornament, five spikes with jeweled tips, subtle particle sparkle",
    4:  "richly ornamented crown, seven spikes, gem cluster at center, brighter glow",
    5:  "ornate multi-gem crown, seven to nine spikes, symmetrical filigree, controlled aura",
    6:  "ornate crown with jeweled band and side accents, radiant highlights, sharper facets",
    7:  "epic crown with tall spikes and modest side extensions, strong ambient glow, faint drifting particles",
    8:  "epic crown with wings or elongated horn-like side extensions, dramatic glow, rich gemstone cluster",
    9:  "imperial dominating crown with fully extended side wings or lion-horns, radiant halo, brilliant particle bloom",
    10: "mythic eternal crown with cosmic effects, twin arcs of orbiting particles, dazzling god-tier glow and dramatic light",
}

TIER_NAMES = {1:"Spark",2:"Ember",3:"Flame",4:"Blaze",5:"Ascendant",6:"Radiant",7:"Sovereign",8:"Regent",9:"Imperial",10:"Eternal"}

# Explicit collection order that matches the visual sheet index (1..100)
COLLECTION_ORDER = [
    "origin","battler","crown_hoarder","social","creator",
    "streak","gifter","spectator","tournament","legend",
]

def build_prompt(collection_slug: str, tier_index: int, crown_number: int) -> str:
    c = COLLECTIONS[collection_slug]
    tier_mod = TIER_MODIFIERS[tier_index]
    tier_name = TIER_NAMES[tier_index]
    return (
        f"A single premium collectible CrownMe achievement crown, reference number {crown_number}, "
        f"themed as '{c['motif']}'. "
        f"Palette: {c['palette']}. Gemstones: {c['gems']}. "
        f"Tier {tier_index} of 10 ({tier_name}): {tier_mod}. "
        "Rendered as a highly detailed luxury 3D game asset with sharp metal edges, clean gem facets, "
        "clear ornamental engraving, controlled glow, symmetrical composition, front-facing view, "
        "perfectly centered horizontally, the lower crown band positioned near the bottom of the visible artwork. "
        "Transparent background with real alpha, no rectangular backdrop, no checkerboard, no black or purple or white background, "
        "no floor, no shadow plane, no number, no text, no watermark, no card, no badge, no shield, "
        "no avatar, no duplicate crown. Only the crown, with its full glow and particles fully visible and not clipped. "
        "Production-grade 2048x2048 collectible asset for a premium mobile game economy."
    )
