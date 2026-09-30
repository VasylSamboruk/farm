# Farmer Profile Art

Upload the profile artwork to this folder using the exact filenames below. The profile currently uses CSS placeholders, so the screen works before these images are added. PNG is preferred; keep text and labels out of button artwork because the UI renders them dynamically.

| File | Recommended size | Format | Used for |
| --- | ---: | --- | --- |
| `logo_sign.png` | 640 x 200 | Transparent PNG | Farm Canvas wooden logo plaque in the sidebar |
| `sidebar_wood_tile.png` | 256 x 512 | Seamless PNG | Repeating wood surface behind sidebar navigation |
| `nav_button.png` | 480 x 112 | Transparent PNG | Normal sidebar navigation button frame |
| `nav_button_active.png` | 480 x 112 | Transparent PNG | Selected sidebar navigation button frame |
| `avatar_frame.png` | 320 x 320 | Transparent PNG | Decorative ring around the player's uploaded avatar |
| `level_medallion.png` | 256 x 256 | Transparent PNG | Level badge behind the dynamic level number |
| `stat_coin.png` | 128 x 128 | Transparent PNG | Coin icon in the profile statistics |
| `stat_inventory.png` | 128 x 128 | Transparent PNG | Inventory icon in the profile statistics |
| `stat_xp.png` | 128 x 128 | Transparent PNG | Experience icon in the profile statistics |
| `play_button.png` | 1200 x 240 | Transparent PNG | Wide green/wood Play button frame; keep its center clear for text |
| `profile_panel_frame.png` | 1400 x 900 | Transparent PNG | Decorative wooden border and parchment center for the farmer profile panel |
| `friends_panel_frame.png` | 1400 x 900 | Transparent PNG | Decorative wooden border and parchment center for the friends board |
| `friend_row_frame.png` | 960 x 180 | Transparent PNG | Reusable frame behind one friend row/card |
| `visit_button.png` | 420 x 100 | Transparent PNG | Green “В гості” button frame; no baked-in lettering |
| `fence_foreground.png` | 1800 x 420 | Transparent PNG | Optional decorative fence/grass strip along the lower edge of the lobby |

## Artwork Notes

- Design the panels with wide, stretch-safe blank centers and keep important corner ornaments near the outside edges.
- Keep button backgrounds text-free; the app adds Ukrainian labels, icons, hover states, and focus states.
- Use transparent padding around the avatar frame, medallion, stat icons, logo plaque, and foreground fence.
- The current game background remains `client/public/assets/fonik1.png`; this folder is only for profile and lobby UI artwork.
- Add the art incrementally. The CSS version remains the fallback until each image is wired into the interface.
