// Strings added in v3 (deadlines, accurate location, trash-level model). English is the fallback for hi / gu.
export default {
  en: {
    dl_label: 'Deadline', dl_due: 'Due', dl_missed: 'deadline missed', dl_late_tasks: 'Past deadline', dl_today: 'Today 6 PM', dl_tomorrow: 'Tomorrow 10 AM',
    dl_auto: 'No deadline picked: it is set from the waste level (High 6 h, Medium 24 h, Low 48 h, Emergency 2 h).',
    dl_left: '{t} left', dl_over: 'Late by {t}',
    rp_drag: 'Drag the blue pin to the exact spot of the garbage, or tap the map.',
    rp_weak_gps: 'GPS is only accurate to about {m} m here. Step outside or drag the pin to the exact spot.',
    ai_clean: 'Clean', ai_low: 'Low', ai_medium: 'Medium', ai_high: 'High',
    ai_zeroshot: 'Trash level from the CLIP vision model (pretrained, runs on this server).',
    ai_trained: 'Trash level from the model trained on this ward\'s photos.',
    tr_open_map: 'Open in Maps', tr_team: '{team} is assigned to this spot',
  },
  hi: {
    dl_label: 'समय-सीमा', dl_due: 'अंतिम समय', dl_missed: 'समय-सीमा चूकी', dl_left: '{t} बाकी', dl_over: '{t} देर',
    rp_drag: 'नीले पिन को कचरे की सही जगह पर खींचें, या नक्शे पर टैप करें।', tr_open_map: 'नक्शे में खोलें',
  },
  gu: {
    dl_label: 'સમયમર્યાદા', dl_due: 'છેલ્લો સમય', dl_missed: 'સમયમર્યાદા ચૂકી', dl_left: '{t} બાકી', dl_over: '{t} મોડું',
    rp_drag: 'વાદળી પિનને કચરાની ચોક્કસ જગ્યાએ ખેંચો, અથવા નકશા પર ટૅપ કરો.', tr_open_map: 'નકશામાં ખોલો',
  },
};
