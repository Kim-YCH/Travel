(function (window) {
  'use strict';

  // Standard shapes: Lucide 0.468.0 (ISC); see vendor/lucide-LICENSE.
  // Destination silhouettes and pastel layers are presentation-only.
  const glyphs = {
    'pin': { body: "<path d=\"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0\" fill=\"#F8CDC8\" stroke=\"none\"/><circle cx=\"12\" cy=\"10\" r=\"3\" fill=\"#FFF3CF\" stroke=\"none\"/><path d=\"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0\"/><circle cx=\"12\" cy=\"10\" r=\"3\"/>", mono: false },
    'wallet': { body: "<rect x=\"3\" y=\"7\" width=\"18\" height=\"14\" rx=\"2\" fill=\"#F6D7AD\" stroke=\"none\"/><path d=\"M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1\"/><path d=\"M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4\"/>", mono: false },
    'backpack': { body: "<path d=\"M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z\" fill=\"#D6E7CF\" stroke=\"none\"/><path d=\"M8 22v-6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6\" fill=\"#F6D7AD\" stroke=\"none\"/><path d=\"M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z\"/><path d=\"M8 10h8\"/><path d=\"M8 18h8\"/><path d=\"M8 22v-6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6\"/><path d=\"M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2\"/>", mono: false },
    'settings': { body: "<path d=\"M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z\" fill=\"#E2E8F0\" stroke=\"none\"/><path d=\"M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>", mono: false },
    'ledger': { body: "<path d=\"M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4\" fill=\"#D9E8F8\" stroke=\"none\"/><path d=\"M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4\"/><path d=\"M2 6h4\"/><path d=\"M2 10h4\"/><path d=\"M2 14h4\"/><path d=\"M2 18h4\"/><path d=\"M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z\"/>", mono: false },
    'camera': { body: "<path d=\"M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z\" fill=\"#F8CDC8\" stroke=\"none\"/><circle cx=\"12\" cy=\"13\" r=\"3\" fill=\"#D9E8F8\" stroke=\"none\"/><path d=\"M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z\"/><circle cx=\"12\" cy=\"13\" r=\"3\"/>", mono: false },
    'food': { body: "<path d=\"M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z\" fill=\"#F6D7AD\" stroke=\"none\"/><path d=\"M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z\"/><path d=\"M7 21h10\"/><path d=\"M19.5 12 22 6\"/><path d=\"M16.25 3c.27.1.8.53.75 1.36-.06.83-.93 1.2-1 2.02-.05.78.34 1.24.73 1.62\"/><path d=\"M11.25 3c.27.1.8.53.74 1.36-.05.83-.93 1.2-.98 2.02-.06.78.33 1.24.72 1.62\"/><path d=\"M6.25 3c.27.1.8.53.75 1.36-.06.83-.93 1.2-1 2.02-.05.78.34 1.24.74 1.62\"/>", mono: false },
    'coffee': { body: "<path d=\"M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1\" fill=\"#D9E8F8\" stroke=\"none\"/><path d=\"M10 2v2\"/><path d=\"M14 2v2\"/><path d=\"M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1\"/><path d=\"M6 2v2\"/>", mono: false },
    'bed': { body: "<path d=\"M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8\" fill=\"#D9E8F8\" stroke=\"none\"/><path d=\"M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4\" fill=\"#F6D7AD\" stroke=\"none\"/><path d=\"M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8\"/><path d=\"M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4\"/><path d=\"M12 4v6\"/><path d=\"M2 18h20\"/>", mono: false },
    'train': { body: "<path d=\"M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z\" fill=\"#D9E8F8\" stroke=\"none\"/><path d=\"M8 3.1V7a4 4 0 0 0 8 0V3.1\"/><path d=\"m9 15-1-1\"/><path d=\"m15 15 1-1\"/><path d=\"M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z\"/><path d=\"m8 19-2 3\"/><path d=\"m16 19 2 3\"/>", mono: false },
    'shopping': { body: "<path d=\"M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z\" fill=\"#F8CDC8\" stroke=\"none\"/><path d=\"M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z\"/><path d=\"M3 6h18\"/><path d=\"M16 10a4 4 0 0 1-8 0\"/>", mono: false },
    'star': { body: "<path d=\"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z\" fill=\"#FFE4A3\" stroke=\"none\"/><path d=\"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z\"/>", mono: false },
    'shirt': { body: "<path d=\"M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z\" fill=\"#D6E7CF\" stroke=\"none\"/><path d=\"M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z\"/>", mono: false },
    'phone': { body: "<rect width=\"14\" height=\"20\" x=\"5\" y=\"2\" rx=\"2\" ry=\"2\" fill=\"#D9E8F8\" stroke=\"none\"/><rect width=\"14\" height=\"20\" x=\"5\" y=\"2\" rx=\"2\" ry=\"2\"/><path d=\"M12 18h.01\"/>", mono: false },
    'medical': { body: "<rect width=\"20\" height=\"14\" x=\"2\" y=\"6\" rx=\"2\" fill=\"#F8CDC8\" stroke=\"none\"/><path d=\"M12 11v4\"/><path d=\"M14 13h-4\"/><path d=\"M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2\"/><path d=\"M18 6v14\"/><path d=\"M6 6v14\"/><rect width=\"20\" height=\"14\" x=\"2\" y=\"6\" rx=\"2\"/>", mono: false },
    'gift': { body: "<rect x=\"3\" y=\"8\" width=\"18\" height=\"4\" rx=\"1\" fill=\"#F8CDC8\" stroke=\"none\"/><path d=\"M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7\" fill=\"#F6D7AD\" stroke=\"none\"/><rect x=\"3\" y=\"8\" width=\"18\" height=\"4\" rx=\"1\"/><path d=\"M12 8v13\"/><path d=\"M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7\"/><path d=\"M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5\"/>", mono: false },
    'city': { body: "<path d=\"M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z\" fill=\"#D9E8F8\" stroke=\"none\"/><path d=\"M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z\"/><path d=\"M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2\"/><path d=\"M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2\"/><path d=\"M10 6h4\"/><path d=\"M10 10h4\"/><path d=\"M10 14h4\"/><path d=\"M10 18h4\"/>", mono: false },
    'mountain': { body: "<path d=\"m8 3 4 8 5-5 5 15H2L8 3z\" fill=\"#D6E7CF\" stroke=\"none\"/><path d=\"m8 3 4 8 5-5 5 15H2L8 3z\"/>", mono: false },
    'luggage': { body: "<path d=\"M6 20a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2\" fill=\"#F6D7AD\" stroke=\"none\"/><path d=\"M6 20a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2\"/><path d=\"M8 18V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v14\"/><path d=\"M10 20h4\"/><circle cx=\"16\" cy=\"20\" r=\"2\"/><circle cx=\"8\" cy=\"20\" r=\"2\"/>", mono: false },
    'ticket': { body: "<path d=\"M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z\" fill=\"#FFE4A3\" stroke=\"none\"/><path d=\"M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z\"/><path d=\"M13 5v2\"/><path d=\"M13 17v2\"/><path d=\"M13 11v2\"/>", mono: false },
    'edit': { body: "<path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\"/><path d=\"m15 5 4 4\"/>", mono: true },
    'close': { body: "<path d=\"M18 6 6 18\"/><path d=\"m6 6 12 12\"/>", mono: true },
    'add': { body: "<path d=\"M5 12h14\"/><path d=\"M12 5v14\"/>", mono: true },
    'chevron-down': { body: "<path d=\"m6 9 6 6 6-6\"/>", mono: true },
    'chevron-up': { body: "<path d=\"m18 15-6-6-6 6\"/>", mono: true },
    'arrow-up': { body: "<path d=\"m5 12 7-7 7 7\"/><path d=\"M12 19V5\"/>", mono: true },
    'arrow-down': { body: "<path d=\"M12 5v14\"/><path d=\"m19 12-7 7-7-7\"/>", mono: true },
    'back': { body: "<path d=\"m12 19-7-7 7-7\"/><path d=\"M19 12H5\"/>", mono: true },
    'next': { body: "<path d=\"M5 12h14\"/><path d=\"m12 5 7 7-7 7\"/>", mono: true },
    'refresh': { body: "<path d=\"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8\"/><path d=\"M21 3v5h-5\"/><path d=\"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16\"/><path d=\"M8 16H3v5\"/>", mono: true },
    'search': { body: "<circle cx=\"11\" cy=\"11\" r=\"8\"/><path d=\"m21 21-4.3-4.3\"/>", mono: true },
    'locate': { body: "<line x1=\"2\" x2=\"5\" y1=\"12\" y2=\"12\"/><line x1=\"19\" x2=\"22\" y1=\"12\" y2=\"12\"/><line x1=\"12\" x2=\"12\" y1=\"2\" y2=\"5\"/><line x1=\"12\" x2=\"12\" y1=\"19\" y2=\"22\"/><circle cx=\"12\" cy=\"12\" r=\"7\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>", mono: true },
    'compass': { body: "<path d=\"m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z\"/><circle cx=\"12\" cy=\"12\" r=\"10\"/>", mono: true },
    'copy': { body: "<rect width=\"14\" height=\"14\" x=\"8\" y=\"8\" rx=\"2\" ry=\"2\"/><path d=\"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2\"/>", mono: true },
    'share': { body: "<circle cx=\"18\" cy=\"5\" r=\"3\"/><circle cx=\"6\" cy=\"12\" r=\"3\"/><circle cx=\"18\" cy=\"19\" r=\"3\"/><line x1=\"8.59\" x2=\"15.42\" y1=\"13.51\" y2=\"17.49\"/><line x1=\"15.41\" x2=\"8.59\" y1=\"6.51\" y2=\"10.49\"/>", mono: true },
    'download': { body: "<path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><polyline points=\"7 10 12 15 17 10\"/><line x1=\"12\" x2=\"12\" y1=\"15\" y2=\"3\"/>", mono: true },
    'delete': { body: "<path d=\"M3 6h18\"/><path d=\"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6\"/><path d=\"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2\"/><line x1=\"10\" x2=\"10\" y1=\"11\" y2=\"17\"/><line x1=\"14\" x2=\"14\" y1=\"11\" y2=\"17\"/>", mono: true },
    'grip': { body: "<circle cx=\"9\" cy=\"12\" r=\"1\"/><circle cx=\"9\" cy=\"5\" r=\"1\"/><circle cx=\"9\" cy=\"19\" r=\"1\"/><circle cx=\"15\" cy=\"12\" r=\"1\"/><circle cx=\"15\" cy=\"5\" r=\"1\"/><circle cx=\"15\" cy=\"19\" r=\"1\"/>", mono: true },
    'check': { body: "<path d=\"M20 6 9 17l-5-5\"/>", mono: true },
    'document': { body: "<path d=\"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z\"/><path d=\"M14 2v4a2 2 0 0 0 2 2h4\"/><path d=\"M10 9H8\"/><path d=\"M16 13H8\"/><path d=\"M16 17H8\"/>", mono: true },
    'people': { body: "<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/><path d=\"M22 21v-2a4 4 0 0 0-3-3.87\"/><path d=\"M16 3.13a4 4 0 0 1 0 7.75\"/>", mono: true },
    'calendar': { body: "<path d=\"M8 2v4\"/><path d=\"M16 2v4\"/><rect width=\"18\" height=\"18\" x=\"3\" y=\"4\" rx=\"2\"/><path d=\"M3 10h18\"/><path d=\"M8 14h.01\"/><path d=\"M12 14h.01\"/><path d=\"M16 14h.01\"/><path d=\"M8 18h.01\"/><path d=\"M12 18h.01\"/><path d=\"M16 18h.01\"/>", mono: true },
    'currency': { body: "<rect width=\"20\" height=\"14\" x=\"2\" y=\"5\" rx=\"2\"/><line x1=\"2\" x2=\"22\" y1=\"10\" y2=\"10\"/>", mono: true },
    'image-add': { body: "<path d=\"M16 5h6\"/><path d=\"M19 2v6\"/><path d=\"M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5\"/><path d=\"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\"/><circle cx=\"9\" cy=\"9\" r=\"2\"/>", mono: true },
    'more': { body: "<circle cx=\"12\" cy=\"12\" r=\"1\"/><circle cx=\"19\" cy=\"12\" r=\"1\"/><circle cx=\"5\" cy=\"12\" r=\"1\"/>", mono: true },
    'plane': { body: "<path d=\"M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z\"/>", mono: true },
    'waves': { body: "<path d=\"M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1\"/><path d=\"M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1\"/><path d=\"M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1\"/>", mono: true },
    'pill': { body: "<path d=\"m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z\"/><path d=\"m8.5 8.5 7 7\"/>", mono: true },
    passport: { body: '<rect x="4" y="2" width="16" height="20" rx="2" fill="#D9E8F8"/><circle cx="12" cy="9" r="4" fill="#FFF3CF"/><path d="M8 9h8M12 5c-2 2-2 6 0 8 2-2 2-6 0-8M8 17h8M9 20h6"/>' },
    toiletries: { body: '<rect x="10" y="8" width="10" height="14" rx="3" fill="#D9E8F8"/><path d="M13 8V4h7M16 4V2h4M3 10v11M3 10h3V4H3z" fill="#D6E7CF"/><path d="M3 6h3M3 8h3"/>' },
    seoul: { viewBox: '0 0 32 32', body: '<path d="M2 29c5-10 10-10 15 0M13 29c6-16 11-16 17 0" fill="#D6E7CF"/><path d="M13 13h6v4h-6zM14 17h4v12h-4z" fill="#D9E8F8"/><path d="M16 2v7M14 9h4v4h-4M12 29h8"/>' },
    tokyo: { viewBox: '0 0 32 32', body: '<path d="m16 3-3 11-6 15h5l4-8 4 8h5l-6-15z" fill="#F8CDC8"/><path d="M16 1v3M12 14h8M10 21h12M13 29h6M13 14l6 7M19 14l-6 7"/>' },
    osaka: { viewBox: '0 0 32 32', body: '<path d="M5 29h22l-3-6H8z" fill="#D6E7CF"/><path d="M9 14h14v9H9zM12 8h8v6h-8z" fill="#D9E8F8"/><path d="m9 8 7-5 7 5-3 1h-8zM5 15l11-5 11 5-4 1H9zM7 23l9-5 9 5M13 23v-5M19 23v-5M16 2v2"/>' },
    jeju: { viewBox: '0 0 32 32', body: '<circle cx="16" cy="17" r="9" fill="#F6D7AD"/><path d="M16 8c0-5 5-6 8-5-1 4-4 6-8 5z" fill="#D9E8F8"/><path d="M2 24c3-3 5 3 8 0s5 3 8 0 5 3 8 0 4 0 4 0M3 29c3-3 5 3 8 0s5 3 8 0 5 3 8 0"/>' },
    busan: { viewBox: '0 0 32 32', body: '<path d="M2 23h28v6H2z" fill="#D9E8F8" stroke="none"/><path d="M8 6v18M24 6v18M2 20h28M2 12c4 0 6-6 6-6s3 9 8 9 8-9 8-9 2 6 6 6M4 12v8M12 13v7M20 13v7M28 12v8" fill="none"/><path d="M8 6v13M24 6v13" stroke="#C87B72"/><path d="M2 27c3-3 5 3 8 0s5 3 8 0 5 3 8 0 4 0 4 0"/>' },
    island: { viewBox: '0 0 32 32', body: '<path d="M5 25c5-7 17-7 22 0" fill="#F6D7AD"/><path d="M16 22c2-7 2-12 0-16M16 8c-6-6-10-2-11 1 5-1 8-1 11 1M16 8c4-5 9-2 11 1-5-1-8-1-11 1" fill="#D6E7CF"/><path d="M2 28c3-3 5 3 8 0s5 3 8 0 5 3 8 0 4 0 4 0"/>' }
  };

  // Small destination silhouettes share the 32px grid and two pastel fills.
  Object.assign(glyphs, {
    incheon: { viewBox: '0 0 32 32', body: '<path d="M3 25h26v5H3zM6 12h5v13H6z" fill="#D9E8F8"/><path d="M4 8h9l-2 4H6zM15 20h13v5H15z" fill="#F6D7AD"/><path d="M8 4v4M18 6l10 3-10 3 2-3zM18 22h7"/>' },
    daegu: { viewBox: '0 0 32 32', body: '<path d="m12 29 3-16h2l3 16z" fill="#D9E8F8"/><path d="M9 10h14l-3 5h-8z" fill="#F6D7AD"/><path d="M16 2v8M13 7h6M10 29h12M12 12h8"/>' },
    daejeon: { viewBox: '0 0 32 32', body: '<path d="m12 29 2-15h4l2 15zM10 10h12l-4 5h-4z" fill="#D9E8F8"/><circle cx="16" cy="7" r="4" fill="#F6D7AD"/><path d="M7 29h18M4 17c5-6 19-6 24 0M5 21c5-5 17-5 22 0"/>' },
    gwangju: { viewBox: '0 0 32 32', body: '<path d="M5 29V16l6-5v18M13 29V6h6v23M21 29V14h6v15" fill="#D9E8F8"/><path d="m16 2 2 4h-4z" fill="#F6D7AD"/><path d="M2 29h28M15 11h2M15 16h2M23 19h2"/>' },
    suwon: { viewBox: '0 0 32 32', body: '<path d="M4 17h24v12H4z" fill="#F6D7AD"/><path d="m3 17 5-4h16l5 4M7 13l4-6h10l4 6z" fill="#D6E7CF"/><path d="M12 29v-7a4 4 0 0 1 8 0v7M4 22h4M24 22h4M13 10h6"/>' },
    gangwon: { viewBox: '0 0 32 32', body: '<path d="m2 28 10-16 8 16zM12 28l9-20 9 20z" fill="#D9E8F8"/><path d="m16 19 5-11 5 11-5-3z" fill="#FFFFFF"/><path d="M7 2v8M3 6h8M4 3l6 6M10 3 4 9M2 29h28"/>' },
    gyeongju: { viewBox: '0 0 32 32', body: '<path d="M10 12h12v16H10zM7 28h18v2H7z" fill="#F6D7AD"/><path d="m8 12 8-5 8 5M6 19l10-5 10 5M4 26l12-5 12 5" fill="#D9E8F8"/><path d="M16 2v5M13 9h6M14 28v-4h4v4"/>' },
    kyoto: { viewBox: '0 0 32 32', body: '<path d="M7 8h4v21H7zM21 8h4v21h-4zM4 14h24v3H4zM3 5q13 4 26 0v4H3z" fill="#F8CDC8"/><path d="M16 9v5M5 29h8M19 29h8"/>' },
    fukuoka: { viewBox: '0 0 32 32', body: '<path d="m23 9-2 20h7L26 9zM21 7h7v4h-7z" fill="#D9E8F8"/><path d="M2 20h17a8 8 0 0 1-17 0z" fill="#F6D7AD"/><path d="M24 2v5M5 16c-2-2 2-3 0-5M10 16c-2-2 2-3 0-5M15 16l4-8M5 29h11"/>' },
    hokkaido: { viewBox: '0 0 32 32', body: '<path d="m2 29 9-12 7 7 5-11 7 16z" fill="#D9E8F8"/><path d="m19 21 4-8 4 10-4-3z" fill="#FFFFFF"/><path d="M10 2v10M5 4l10 6M5 10l10-6M7 2l3 3 3-3M7 12l3-3 3 3M2 29h28"/>' },
    sapporo: { viewBox: '0 0 32 32', body: '<path d="M6 29V18l10-8 10 8v11zM12 12V5h8v7" fill="#F6D7AD"/><path d="m9 5 7-4 7 4M3 19l13-10 13 10" fill="#D9E8F8"/><circle cx="16" cy="9" r="3"/><path d="M16 7v2h2M13 29v-7h6v7M9 22v3M23 22v3"/>' },
    otaru: { viewBox: '0 0 32 32', body: '<path d="M3 12h15v12H3zM3 12l7-6 8 6" fill="#F6D7AD"/><path d="M2 25h28v5H2z" fill="#D9E8F8"/><path d="M7 16v4M13 16v4M25 9v16M22 9h6l-1-5h-4zM2 28c5-3 9 3 14 0s9 3 14 0"/>' },
    nagoya: { viewBox: '0 0 32 32', body: '<path d="M8 15h16v14H8zM12 9h8v6h-8z" fill="#F6D7AD"/><path d="m7 15 9-5 9 5M4 24l12-6 12 6M10 9l6-4 6 4" fill="#D6E7CF"/><path d="M11 5V2l3 3M21 5V2l-3 3M13 29v-5h6v5M5 29h22"/>' },
    yokohama: { viewBox: '0 0 32 32', body: '<circle cx="11" cy="13" r="9" fill="#D9E8F8"/><path d="M24 28V12l5-5v21z" fill="#F8CDC8"/><path d="M11 4v18M2 13h18M5 7l12 12M5 19 17 7M11 13 5 28M11 13l6 15M2 29h28"/>' },
    kobe: { viewBox: '0 0 32 32', body: '<path d="M10 7h12c-4 8-4 12 0 20H10c4-8 4-12 0-20z" fill="#F8CDC8"/><path d="M3 27h26v4H3z" fill="#D9E8F8"/><path d="M12 3h8v4h-8M10 7l12 20M22 7 10 27M12 13h8M12 21h8M3 30c5-2 8 2 13 0s8 2 13 0"/>' },
    nara: { viewBox: '0 0 32 32', body: '<path d="M6 17h15l3-8 5 3-3 8-4 3H9l-3-2z" fill="#F6D7AD"/><path d="M24 9V3M24 5l-4-3M24 7l5-4M6 18l-3-3M9 22v7M19 23v6M23 21v8"/><circle cx="26" cy="13" r=".8" fill="#334155" stroke="none"/>' },
    okinawa: { viewBox: '0 0 32 32', body: '<path d="M16 14c-9 2-13-5-7-7-2-7 6-8 9-2 6-4 11 2 6 7 7 4 2 11-4 8-2 7-10 5-9-1z" fill="#F8CDC8"/><circle cx="17" cy="13" r="3"/><path d="M2 25c3-3 5 3 8 0s5 3 8 0 5 3 8 0M3 30c3-3 5 3 8 0s5 3 8 0 5 3 8 0" stroke="#547CA8"/>' },
    sendai: { viewBox: '0 0 32 32', body: '<path d="M23 2a7 7 0 1 0 6 10 7 7 0 0 1-6-10z" fill="#F6D7AD"/><path d="m2 29 9-12 6 6 6-6 7 12z" fill="#D6E7CF"/><path d="M8 29v-7h9v7M6 22l6-5 7 5M11 25h3"/>' },
    hiroshima: { viewBox: '0 0 32 32', body: '<path d="M8 8h3v17H8zM21 8h3v17h-3zM4 13h24v3H4zM3 5q13 3 26 0v4H3z" fill="#F8CDC8"/><path d="M2 25h28v5H2z" fill="#D9E8F8" stroke="none"/><path d="M16 9v4M2 28c3-3 5 3 8 0s5 3 8 0 5 3 8 0 4 0 4 0"/>' },
    kumamoto: { viewBox: '0 0 32 32', body: '<path d="M8 15h16v14H8zM11 9h10v6H11z" fill="#D9E8F8"/><path d="m7 15 9-7 9 7M4 23l12-6 12 6M9 9l7-6 7 6" fill="#D6E7CF"/><path d="M12 3V1M20 3V1M12 27v-3M16 27v-3M20 27v-3M5 29h22"/>' },
    nagasaki: { viewBox: '0 0 32 32', body: '<path d="M8 26V13l8-9 8 9v13z" fill="#F6D7AD"/><path d="M2 27h28v4H2z" fill="#D9E8F8" stroke="none"/><path d="M16 1v7M13 3h6M6 14l10-10 10 10M13 26v-8a3 3 0 0 1 6 0v8M2 29c3-2 5 2 8 0s5 2 8 0 5 2 8 0"/>' },
    hakone: { viewBox: '0 0 32 32', body: '<path d="m2 19 9-12 7 9 5-6 7 9z" fill="#D6E7CF"/><ellipse cx="16" cy="26" rx="13" ry="4" fill="#D9E8F8"/><path d="M10 24c-4-4 4-5 0-9M16 24c-4-4 4-5 0-9M22 24c-4-4 4-5 0-9"/>' },
    kawaguchiko: { viewBox: '0 0 32 32', body: '<path d="M3 22 16 4l13 18z" fill="#D9E8F8"/><path d="m10 12 6-8 6 8-4-2-2 3-2-3z" fill="#FFFFFF"/><path d="M2 25c3-3 5 3 8 0s5 3 8 0 5 3 8 0 4 0 4 0M4 30c4-2 8 2 12 0s8 2 12 0"/>' },
    fuji: { viewBox: '0 0 32 32', body: '<path d="M2 29 16 7l14 22z" fill="#D9E8F8"/><path d="m10 16 6-9 6 9-4-2-2 3-2-3z" fill="#FFFFFF"/><path d="M3 29h26M22 3h5M24 1v4"/>' },
    kanazawa: { viewBox: '0 0 32 32', body: '<path d="M3 15a13 13 0 0 1 26 0z" fill="#F6D7AD"/><path d="M2 29c4-7 8-7 12 0M20 29c4-8 7-8 10 0" fill="#D6E7CF"/><path d="M16 2v25a3 3 0 0 1-6 0M16 3 8 15M16 3l8 12M3 29h26"/>' },
    hongkong: { viewBox: '0 0 32 32', body: '<path d="M3 25V12h5v13M10 25V7l5-5v23M22 25V10h6v15" fill="#D9E8F8"/><path d="M16 25V14h5v11" fill="#F6D7AD"/><path d="M10 7l5 7-5 7M12 4v4M24 5v5M2 27h28M3 30c4-2 8 2 12 0s8 2 12 0"/>' },
    macau: { viewBox: '0 0 32 32', body: '<path d="M5 29V13h22v16zM9 13V8h14v5zM11 8l5-5 5 5" fill="#F6D7AD"/><path d="M13 29v-7a3 3 0 0 1 6 0v7" fill="#D9E8F8"/><path d="M16 1v4M13 3h6M3 13h26M5 18h22M8 15v3M24 15v3M8 22h2M22 22h2M3 29h26"/>' },
    taipei: { viewBox: '0 0 32 32', body: '<path d="M12 29V9h8v20M11 24h10l-1-5h-8zM11 18h10l-1-5h-8zM12 12h8l-1-5h-6zM13 6h6V3h-6z" fill="#D9E8F8"/><path d="M2 29c3-6 6-6 9 0M21 29c3-4 6-4 9 0" fill="#D6E7CF"/><path d="M16 1v2M2 29h28"/>' },
    taichung: { viewBox: '0 0 32 32', body: '<path d="M3 29V10q6-8 13 0 7-8 13 0v19z" fill="#F6D7AD"/><path d="M7 29V18q3-5 6 0v11M19 29V18q3-5 6 0v11" fill="#D9E8F8"/><path d="M3 14q6-8 13 0 7-8 13 0M2 29h28"/>' },
    tainan: { viewBox: '0 0 32 32', body: '<path d="M5 29V16h22v13z" fill="#F6D7AD"/><path d="m3 16 5-5h16l5 5M8 11l8-6 8 6" fill="#D6E7CF"/><path d="M12 29v-7a4 4 0 0 1 8 0v7M6 20h4M22 20h4M6 24h3M23 24h3M16 2v3"/>' },
    kaohsiung: { viewBox: '0 0 32 32', body: '<path d="M11 25V9h5V3h4v6h5v16h-5V15h-4v10z" fill="#D9E8F8"/><path d="M2 25h9l-2 4H4z" fill="#F6D7AD"/><path d="M6 18v7M6 19l4 3H6M18 1v2M2 30h28"/>' },
    hualien: { viewBox: '0 0 32 32', body: '<path d="m2 26 5-16 5 5 5-12 7 12 6 1v13H2z" fill="#D6E7CF"/><path d="M18 23c4-5 7-5 12-2v9H15z" fill="#D9E8F8"/><path d="m13 16-3 11M17 13l-3 15M20 25c4-2 6 2 9 0M18 29h11"/>' },
    taitung: { viewBox: '0 0 32 32', body: '<path d="m2 29 8-12 7 12 6-8 7 8z" fill="#D6E7CF"/><path d="M18 7a7 7 0 1 1 14 0c0 5-7 10-7 10S18 12 18 7z" transform="translate(-3 1)" fill="#F6D7AD"/><path d="M20 18v3h4v-3M22 2c-4 4-4 7 0 13M2 29h28"/>' },
    'hot-spring': { viewBox: '0 0 32 32', body: '<ellipse cx="16" cy="25" rx="13" ry="5" fill="#D9E8F8"/><path d="M10 20c-5-6 4-7 0-12M16 19c-5-6 4-7 0-12M22 20c-5-6 4-7 0-12M6 25c6 3 14 3 20 0"/>' },
    family: { viewBox: '0 0 32 32', body: '<ellipse cx="11" cy="11" rx="7" ry="9" fill="#F8CDC8"/><ellipse cx="24" cy="13" rx="6" ry="8" fill="#D9E8F8"/><path d="M11 20v9M24 21v8M9 22h4M22 23h4"/>' }
  });

  const NAV_ICONS = Object.freeze({ itinerary: 'pin', money: 'wallet', ledger: 'ledger', prep: 'backpack', settings: 'settings' });
  const TYPE_ICONS = Object.freeze({
    '景點': 'camera', '美食': 'food', '飲食': 'food', '餐廳': 'food',
    '咖啡': 'coffee', '咖啡廳': 'coffee', '住宿': 'bed', '飯店': 'bed',
    '交通': 'train', '購物': 'shopping', '活動': 'ticket', '門票': 'ticket', '其他': 'star'
  });
  const TRIP_DESTINATION_ICON_MAP = Object.freeze({
    seoul: { icon: 'seoul', label: '首爾', concept: '南山塔', keywords: ['首爾', '首尔', 'Seoul', '서울'] },
    busan: { icon: 'busan', label: '釜山', concept: '海港橋', keywords: ['釜山', 'Busan', '부산'] },
    jeju: { icon: 'jeju', label: '濟州島', concept: '橘子與海浪', keywords: ['濟州', '济州', 'Jeju', '제주'] },
    incheon: { icon: 'incheon', label: '仁川', concept: '機場塔台與飛機', keywords: ['仁川', 'Incheon', '인천'] },
    daegu: { icon: 'daegu', label: '大邱', concept: '都市觀景塔', keywords: ['大邱', 'Daegu', '대구'] },
    daejeon: { icon: 'daejeon', label: '大田', concept: '科學塔與軌道', keywords: ['大田', 'Daejeon', '대전'] },
    gwangju: { icon: 'gwangju', label: '光州', concept: '城市光塔', keywords: ['光州', 'Gwangju', 'Kwangju', '광주'] },
    suwon: { icon: 'suwon', label: '水原', concept: '韓式城門', keywords: ['水原', 'Suwon', '수원'] },
    gangwon: { icon: 'gangwon', label: '江原道', concept: '雪山', priority: 1, keywords: ['江原', 'Gangwon', '강원'] },
    gyeongju: { icon: 'gyeongju', label: '慶州', concept: '韓式寺塔', keywords: ['慶州', '庆州', 'Gyeongju', '경주'] },
    tokyo: { icon: 'tokyo', label: '東京', concept: '東京鐵塔', keywords: ['東京', '东京', 'Tokyo', 'とうきょう'] },
    osaka: { icon: 'osaka', label: '大阪', concept: '大阪城', keywords: ['大阪', 'Osaka', 'おおさか'] },
    kyoto: { icon: 'kyoto', label: '京都', concept: '鳥居', keywords: ['京都', 'Kyoto', 'きょうと'] },
    fukuoka: { icon: 'fukuoka', label: '福岡', concept: '拉麵與都市塔', keywords: ['福岡', '福冈', '博多', 'Fukuoka', 'Hakata', 'ふくおか'] },
    hokkaido: { icon: 'hokkaido', label: '北海道', concept: '雪花與山', priority: 1, keywords: ['北海道', 'Hokkaido', 'ほっかいどう'] },
    sapporo: { icon: 'sapporo', label: '札幌', concept: '時計台', keywords: ['札幌', 'Sapporo', 'さっぽろ'] },
    otaru: { icon: 'otaru', label: '小樽', concept: '運河與街燈', keywords: ['小樽', 'Otaru', 'おたる'] },
    nagoya: { icon: 'nagoya', label: '名古屋', concept: '城堡與屋脊', keywords: ['名古屋', 'Nagoya', 'なごや'] },
    yokohama: { icon: 'yokohama', label: '橫濱', concept: '摩天輪與港灣', keywords: ['橫濱', '横浜', '横滨', '横濱', 'Yokohama', 'よこはま'] },
    kobe: { icon: 'kobe', label: '神戶', concept: '港塔', keywords: ['神戶', '神戸', '神户', 'Kobe', 'こうべ'] },
    nara: { icon: 'nara', label: '奈良', concept: '鹿', keywords: ['奈良', 'Nara', 'なら'] },
    okinawa: { icon: 'okinawa', label: '沖繩', concept: '扶桑花與海浪', keywords: ['沖繩', '沖縄', '冲绳', '那霸', 'Okinawa', 'Naha', 'おきなわ'] },
    sendai: { icon: 'sendai', label: '仙台', concept: '新月與山城', keywords: ['仙台', 'Sendai', 'せんだい'] },
    hiroshima: { icon: 'hiroshima', label: '廣島', concept: '海上鳥居', keywords: ['廣島', '広島', '广岛', '宮島', '宫岛', 'Hiroshima', 'Miyajima', 'ひろしま'] },
    kumamoto: { icon: 'kumamoto', label: '熊本', concept: '城堡', keywords: ['熊本', 'Kumamoto', 'くまもと'] },
    nagasaki: { icon: 'nagasaki', label: '長崎', concept: '教堂與港口', keywords: ['長崎', '长崎', 'Nagasaki', 'ながさき'] },
    hakone: { icon: 'hakone', label: '箱根', concept: '山與溫泉', keywords: ['箱根', 'Hakone', 'はこね'] },
    kawaguchiko: { icon: 'kawaguchiko', label: '河口湖', concept: '富士山與湖', keywords: ['河口湖', 'Kawaguchiko', 'かわぐちこ'] },
    fuji: { icon: 'fuji', label: '富士山', concept: '富士山', priority: 1, keywords: ['富士山', 'Fuji', 'Fujisan', 'Fuji-san', 'ふじさん'] },
    kanazawa: { icon: 'kanazawa', label: '金澤', concept: '日式傘與庭園', keywords: ['金澤', '金沢', '金泽', 'Kanazawa', 'かなざわ'] },
    hongkong: { icon: 'hongkong', label: '香港', concept: '維港天際線', keywords: ['香港', '香江', 'Hong Kong', 'Hongkong', 'HK', 'HKG'] },
    macau: { icon: 'macau', label: '澳門', concept: '葡式牌坊', keywords: ['澳門', '澳门', 'Macau', 'Macao'] },
    taipei: { icon: 'taipei', label: '台北', concept: '台北 101', keywords: ['台北', '臺北', 'Taipei'] },
    taichung: { icon: 'taichung', label: '台中', concept: '曲面歌劇院', keywords: ['台中', '臺中', 'Taichung'] },
    tainan: { icon: 'tainan', label: '台南', concept: '紅磚古蹟', keywords: ['台南', '臺南', 'Tainan'] },
    kaohsiung: { icon: 'kaohsiung', label: '高雄', concept: '85 大樓與港口', keywords: ['高雄', 'Kaohsiung'] },
    hualien: { icon: 'hualien', label: '花蓮', concept: '峽谷山海', keywords: ['花蓮', '花莲', 'Hualien'] },
    taitung: { icon: 'taitung', label: '台東', concept: '熱氣球與山', keywords: ['台東', '臺東', '台东', 'Taitung'] }
  });
  Object.values(TRIP_DESTINATION_ICON_MAP).forEach(rule => { Object.freeze(rule.keywords); Object.freeze(rule); });
  const TRIP_FALLBACK_ICON_MAP = Object.freeze([
    { icon: 'hot-spring', keywords: ['溫泉', '温泉', 'hot spring', 'onsen'] },
    { icon: 'island', keywords: ['海島', '海岛', '海邊', '海边', '海灘', '海滩', '小島', '小岛', 'island', 'beach', 'coast'] },
    { icon: 'mountain', keywords: ['山區', '山区', '山景', '山林', '森林', '自然', '登山', '健行', 'mountain', 'mountains', 'forest', 'nature', 'hiking'] },
    { icon: 'shopping', keywords: ['購物', '购物', '逛街', 'shopping', 'outlet'] },
    { icon: 'family', keywords: ['親子', '亲子', '兒童', '儿童', 'family', 'kids', 'children'] },
    { icon: 'city', keywords: ['城市', '都市', '市區', '市区', 'city', 'urban'] }
  ]);
  const PREP_CATEGORIES = [
    { icon: 'passport', label: '證件', words: /證件|证件|護照|护照|身分|身份|passport|document/i, emoji: ['🪪', '📄', '🛂'] },
    { icon: 'shirt', label: '服飾', words: /服飾|服饰|衣服|衣物|穿搭|clothes|clothing/i, emoji: ['👔', '👕', '👗'] },
    { icon: 'toiletries', label: '盥洗', words: /盥洗|洗漱|清潔|清洁|保養|保养|toiletr/i, emoji: ['🛀', '🪥', '🧴'] },
    { icon: 'phone', label: '電子', words: /電子|电子|電器|电器|充電|充电|3c|electronic|device/i, emoji: ['🔌', '📱', '💻'] },
    { icon: 'wallet', label: '金融', words: /金融|金錢|金钱|財務|财务|貨幣|货币|money|finance/i, emoji: ['💰', '💳', '💵'] },
    { icon: 'medical', label: '藥品', words: /藥品|药品|藥物|药物|醫療|医疗|medicine|medical/i, emoji: ['💊', '🩹', '🏥'] },
    { icon: 'gift', label: '伴手禮', words: /伴手禮|伴手礼|禮物|礼物|紀念品|纪念品|souvenir|gift/i, emoji: ['🎁'] },
    { icon: 'shopping', label: '購物', words: /購物|购物|shopping/i, emoji: ['🛍'] }
  ];
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const text = value => String(value || '').normalize('NFKC').trim();
  const withoutEmoji = value => text(value).replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D]/gu, '').trim();
  function keywordPattern(keyword) {
    const literal = text(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s_-]+/g, '[\\s_-]*');
    // Latin word boundaries prevent Fuji matching Fujiwara, or HK matching a name fragment.
    return new RegExp(/[a-z]/i.test(keyword) ? '(?:^|[^a-z])' + literal + '(?=$|[^a-z])' : literal, 'iu');
  }
  const destinationMatchers = Object.values(TRIP_DESTINATION_ICON_MAP).map(rule => ({
    rule, patterns: rule.keywords.map(keyword => ({ pattern: keywordPattern(keyword), rank: /[\p{Script=Han}]/u.test(keyword) ? 0 : /[a-z]/i.test(keyword) ? 1 : 2 }))
  }));
  const fallbackMatchers = TRIP_FALLBACK_ICON_MAP.map(rule => ({ icon: rule.icon, patterns: rule.keywords.map(keywordPattern) }));

  function getNavIcon(key) { return Object.prototype.hasOwnProperty.call(NAV_ICONS, key) ? NAV_ICONS[key] : 'luggage'; }
  function getItineraryTypeIcon(type) {
    const key = text(type);
    return Object.prototype.hasOwnProperty.call(TYPE_ICONS, key) ? TYPE_ICONS[key] : 'star';
  }

  function getTripIcon(trip) {
    const record = typeof trip === 'string' ? { name: trip } : (trip || {});
    const fields = [record.city, record.city_name, record.destination, record.destination_name,
      record.location, record.location_text, record.subtitle, record.region, record.region_name,
      record.region_text, record.display_region, record.area, record.area_name, record.name].map(text);
    let best = null;
    for (const { rule, patterns } of destinationMatchers) {
      for (let field = 0; field < fields.length; field++) {
        const matched = patterns.find(({ pattern }) => pattern.test(fields[field]));
        if (!matched) continue;
        const score = (rule.priority || 0) * 1000 + field * 10 + matched.rank;
        if (!best || score < best.score) best = { icon: rule.icon, score };
        break;
      }
    }
    if (best) return best.icon;
    const source = fields.concat([record.type, record.trip_type, record.travel_type].map(text)).join(' ');
    const fallback = fallbackMatchers.find(({ patterns }) => patterns.some(pattern => pattern.test(source)));
    if (fallback) return fallback.icon;
    if ([record.city, record.city_name, record.destination, record.destination_name, record.location].some(value => text(value))) return 'city';
    return 'luggage';
  }

  function prepCategory(section) {
    const record = typeof section === 'string' ? { title: section } : (section || {});
    const title = withoutEmoji(record.title);
    const named = PREP_CATEGORIES.find(category => category.words.test(title));
    if (named) return named;
    const legacy = text(record.emoji || record.title).replace(/\uFE0F/g, '');
    return PREP_CATEGORIES.find(category => category.emoji.some(emoji => legacy.includes(emoji)))
      || { icon: 'star', label: '其他' };
  }
  function getPrepCategoryIcon(section) { return prepCategory(section).icon; }
  function prepCategoryPresentation(section) {
    const record = typeof section === 'string' ? { title: section } : (section || {});
    const title = String(record.title || '').trim();
    const prefix = String(record.emoji || '').trim();
    const splitSequence = /^[\uFE0E\uFE0F\u200D\p{Emoji_Modifier}]/u.test(title)
      || (/^\p{Regional_Indicator}$/u.test(prefix) && /^\p{Regional_Indicator}$/u.test(title));
    const original = prefix && splitSequence ? prefix + title : title || prefix;
    // Detect symbols before NFKC can turn pictographs such as the information sign into letters.
    const content = original.replace(/\p{Emoji}\uFE0F?\u20E3/gu, '')
      .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji_Modifier}\uFE0E\uFE0F\u200D\u{E0020}-\u{E007F}]/gu, '');
    const iconOnly = !!original && !/[\p{L}\p{N}]/u.test(content);
    return { label: iconOnly ? original : withoutEmoji(title) || prefix || '其他', iconOnly };
  }
  function getPrepCategoryLabel(section) { return prepCategoryPresentation(section).label; }
  function renderPrepCategory(section) {
    const { label, iconOnly } = prepCategoryPresentation(section);
    // Symbol-only category names belong to the user; do not invent a textual category.
    if (iconOnly) {
      return '<span class="prep-category-symbol">' + escape(label) + '</span>';
    }
    return renderIcon(getPrepCategoryIcon(section))
      + '<span class="prep-category-label">' + escape(label) + '</span>';
  }

  function renderIcon(name, options = {}) {
    const key = Object.prototype.hasOwnProperty.call(glyphs, name) ? name : 'star';
    const glyph = glyphs[key];
    const accessibility = options.label
      ? 'role="img" aria-label="' + escape(options.label) + '"'
      : 'aria-hidden="true"';
    const stroke = glyph.mono ? 'currentColor' : 'var(--travel-icon-ink, #334155)';
    return '<svg xmlns="http://www.w3.org/2000/svg" class="travel-icon" data-travel-icon="' + key
      + '" viewBox="' + (glyph.viewBox || '0 0 24 24') + '" width="24" height="24" fill="none" stroke="' + stroke
      + '" stroke-width="' + (glyph.viewBox ? '2.2' : '1.8')
      + '" stroke-linecap="round" stroke-linejoin="round" focusable="false" ' + accessibility + '>' + glyph.body + '</svg>';
  }

  window.TravelIcons = Object.freeze({
    NAV_ICONS, TYPE_ICONS, TRIP_DESTINATION_ICON_MAP, TRIP_FALLBACK_ICON_MAP, getNavIcon, getTripIcon, getItineraryTypeIcon,
    getPrepCategoryIcon, getPrepCategoryLabel, renderPrepCategory, renderIcon
  });
})(typeof window !== 'undefined' ? window : globalThis);
