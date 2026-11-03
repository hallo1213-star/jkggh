// "Öffne deine Systeme": Jarvis' real modules, built from the functions that
// actually exist (cloud tools + laptop tools) and the live service status.
export const CATEGORIES = [
  { key: 'wissen', title: 'Wissen & Suche', icon: '🔎', tools: ['web_search', 'wiki_lookup', 'summarize_url', 'get_news', 'news_region', 'translate', 'calculate', 'currency', 'football', 'quiz'] },
  { key: 'welt', title: 'Wetter & Welt', icon: '🌍', tools: ['get_weather', 'weather_show', 'globe', 'iss_live', 'find_webcams', 'satellite_zoom', 'transit', 'route_plan', 'holidays'] },
  { key: 'gedaechtnis', title: 'Gedächtnis', icon: '🧠', tools: ['memory_save', 'memory_forget', 'memory_list', 'persona_settings'] },
  { key: 'planung', title: 'Planung', icon: '🗓️', tools: ['reminder_add', 'reminder_list', 'reminder_remove', 'appointment_add', 'appointment_list', 'appointment_remove', 'note_add', 'note_find', 'note_remove', 'set_timer', 'countdown', 'daily_briefing', 'briefing_settings', 'focus_mode', 'run_task'] },
  { key: 'kommunikation', title: 'Kommunikation', icon: '✉️', tools: ['email_list', 'email_read', 'email_send', 'telegram_send', 'telegram_status', 'iphone_control', 'order_call', 'invite_link'] },
  { key: 'erstellen', title: 'Erstellen', icon: '🛠️', tools: ['studio_website', 'create_website', 'create_sales_website', 'create_project', 'app_factory', 'create_game', 'create_image', 'design_graphic', 'create_video', 'create_3d_model', 'qr_code', 'mindmap'] },
  { key: 'business', title: 'Business & Geld', icon: '💼', tools: ['business_mode', 'customer_add', 'customer_update', 'customer_list', 'customer_send_offer', 'create_listing', 'money_mode', 'money_status', 'money_income_add', 'money_task_done', 'markets', 'weekly_numbers', 'expense_add', 'expense_summary', 'expense_remove_last'] },
  { key: 'alltag', title: 'Alltag & Einkaufen', icon: '🛒', tools: ['shopping_list_add', 'shopping_list_remove', 'shopping_list_show', 'shopping_list_email', 'shop_search', 'recipe', 'order_find_restaurant', 'order_prepare', 'vocab_add', 'vocab_quiz', 'vocab_lists', 'vocab_remove_list'] },
  { key: 'anzug', title: 'Anzug & Show', icon: '🦾', tools: ['suit_design', 'suit_control', 'suit_fly', 'face_control', 'persona_mode', 'digital_reality', 'level_status', 'day_recap', 'drone_control', 'shield', 'radio_show', 'gift_box', 'appointment_rocket', 'fireworks', 'gravity', 'black_hole', 'time_capsule', 'treasure_hunt', 'holo_chess', 'secret_code', 'escape_room', 'self_destruct', 'ufo_prank', 'random_toss'] },
  { key: 'kamera', title: 'Kamera-Effekte', icon: '📷', tools: ['camera_look', 'effect_control', 'helmet_mirror', 'movie_poster'] }
];

// info: { tools: string[], laptopTools: number, laptop, phone, telegram, gmail, twilio, voice }
export function buildSystems(info) {
  const have = new Set(info.tools);
  const modules = CATEGORIES.map((c) => {
    const present = c.tools.filter((t) => have.has(t));
    let online = true; let detail = `${present.length} Funktionen`;
    if (c.key === 'kommunikation') {
      const parts = [info.gmail ? 'Gmail' : null, info.telegram ? 'Telegram' : null, info.phone ? 'iPhone' : null, info.twilio ? 'Telefon' : null].filter(Boolean);
      detail += parts.length ? ` · aktiv: ${parts.join(', ')}` : ' · keine Dienste verbunden';
      online = parts.length > 0;
    }
    return { key: c.key, title: c.title, icon: c.icon, count: present.length, online, detail };
  }).filter((m) => m.count > 0);
  modules.push({ key: 'laptop', title: 'Laptop-Steuerung', icon: '💻', count: info.laptopTools, online: Boolean(info.laptop), detail: `${info.laptopTools} Funktionen · ${info.laptop ? 'verbunden' : 'nicht verbunden'}` });
  modules.push({ key: 'stimme', title: 'Stimme & Gehör', icon: '🎙️', count: 2, online: true, detail: `Hören: Deepgram · Stimme: ${info.voice}` });
  const total = modules.reduce((n, m) => n + m.count, 0);
  return { modules, total };
}
