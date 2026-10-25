(function (window) {
  'use strict';

  const { computed, ref, onMounted, onBeforeUnmount, nextTick, watch } = window.Vue;

  const FlightTimeline = {
    name: 'FlightTimeline',
    props: { flights: { type: Array, default: () => [] } },
    emits: ['open'],
    setup() {
      const renderIcon = window.TravelIcons.renderIcon;
      return { renderIcon };
    },
    template: `
      <button v-for="flight in flights" :key="flight.id" type="button"
        class="flight-timeline-row" :class="'flight-tone--' + flight.flight_type"
        :data-flight-id="flight.id" @click="$emit('open', flight.id)"
        :aria-label="flight.typeLabel + ' ' + flight.flightNo + ' ' + flight.departAirport + ' 至 ' + flight.arriveAirport">
        <span class="flight-timeline__rail">
          <strong>{{ flight.departTimeLabel }}</strong>
          <span class="flight-timeline__node" v-html="renderIcon('plane')"></span>
        </span>
        <span class="flight-timeline__body">
          <span class="flight-timeline__type">{{ flight.typeLabel }}</span>
          <strong>{{ flight.departAirport }} <span aria-hidden="true">→</span> {{ flight.arriveAirport }}</strong>
          <span class="flight-timeline__details">{{ flight.flightNo }} · {{ flight.arriveTimeLabel }} 抵達<span v-if="flight.arriveTerminal"> · {{ flight.arriveTerminal }}</span></span>
          <span v-if="flight.arriveDateLabel !== flight.departDateLabel" class="flight-timeline__details">抵達 {{ flight.arriveDateLabel }}</span>
        </span>
      </button>`
  };

  const StayTimeline = {
    name: 'StayTimeline',
    props: { hotels: { type: Array, default: () => [] }, busy: Boolean },
    emits: ['open', 'edit', 'remove'],
    setup() {
      return { renderIcon: window.TravelIcons.renderIcon, rangeLabel: window.TravelHotels.hotelDayRangeLabel };
    },
    template: `
      <div v-for="hotel in hotels" :key="hotel.id" class="stay-timeline-row flight-tone--stay" :data-stay-id="hotel.id">
        <button type="button" class="flight-timeline-row stay-timeline-open" data-stay-action="open" @click="$emit('open', hotel)" :aria-label="'開啟住宿地圖：' + hotel.name">
          <span class="flight-timeline__rail"><strong>住宿</strong><span class="flight-timeline__node" v-html="renderIcon('bed')"></span></span>
          <span class="flight-timeline__body">
            <strong>{{ hotel.name || '住宿' }}</strong>
            <span class="flight-timeline__details">{{ rangeLabel(hotel) }}</span>
            <span v-if="hotel.address" class="flight-timeline__details">{{ hotel.address }}</span>
            <span v-if="hotel.note" class="stay-timeline-note">{{ hotel.note }}</span>
          </span>
        </button>
        <div class="stay-timeline-actions">
          <button type="button" class="flight-icon-button" title="編輯住宿" aria-label="編輯住宿" data-stay-action="edit" :disabled="busy" @click="$emit('edit', hotel)"><span v-html="renderIcon('edit')"></span></button>
          <button type="button" class="flight-icon-button flight-icon-button--danger" title="刪除住宿" aria-label="刪除住宿" data-stay-action="remove" :disabled="busy" @click="$emit('remove', hotel.id)"><span v-html="renderIcon('delete')"></span></button>
        </div>
      </div>`
  };

  const FlightPage = {
    name: 'FlightPage',
    components: { FlightTimeline },
    props: {
      cards: { type: Array, default: () => [] },
      backendReady: Boolean,
      busy: Boolean,
      error: { type: String, default: '' },
      focusedId: { type: String, default: '' },
      schemaWarning: { type: String, default: '' }
    },
    emits: ['add', 'edit', 'remove', 'visibility'],
    setup(props, { emit }) {
      const renderIcon = window.TravelIcons.renderIcon;
      const selectedCount = computed(() => props.cards.filter(card => card.show_in_itinerary).length);
      const allVisible = computed(() => props.cards.length > 0 && selectedCount.value === props.cards.length);
      const mixedVisibility = computed(() => selectedCount.value > 0 && !allVisible.value);
      const previewCards = computed(() => props.cards.filter(card => card.show_in_itinerary && card.isValid && card.day !== null));
      const canWrite = computed(() => props.backendReady && !props.busy);
      const request = (event, value) => { if (canWrite.value) emit(event, value); };
      const setVisibility = event => {
        if (canWrite.value && props.cards.length) emit('visibility', event.target.checked);
        else event.target.checked = allVisible.value;
      };
      return { renderIcon, allVisible, mixedVisibility, previewCards, canWrite, request, setVisibility };
    },
    template: `
      <section class="flights-page" aria-labelledby="flights-page-title" :aria-busy="busy">
        <div class="flights-main">
          <div class="flights-heading">
            <h2 id="flights-page-title"><span v-html="renderIcon('plane')"></span> 航班</h2>
            <button type="button" class="flight-button flight-button--primary" :disabled="!canWrite" @click="request('add')">
              <span v-html="renderIcon('add')"></span> 新增航班
            </button>
          </div>
          <p v-if="!backendReady && !schemaWarning" class="flight-notice" role="status">航班服務載入中，或後端尚未更新；目前僅可檢視已載入的資料。</p>
          <p v-if="schemaWarning" class="flight-notice" role="status">{{ schemaWarning }}</p>
          <p v-if="error" class="flight-notice flight-notice--error" role="alert">{{ error }}</p>
          <p v-if="busy" class="flight-status" role="status">正在儲存航班...</p>
          <div v-if="!cards.length" class="flights-empty">
            <span class="flights-empty__icon" v-html="renderIcon('plane')"></span>
            <h3>尚無航班</h3>
            <button type="button" class="flight-button" :disabled="!canWrite" @click="request('add')"><span v-html="renderIcon('add')"></span> 新增航班</button>
          </div>
          <div class="flight-card-list">
            <article v-for="card in cards" :key="card.id" :id="'flight-' + card.id" tabindex="-1"
              class="flight-card" :class="['flight-card--' + card.flight_type, { 'is-focused': focusedId === card.id }]">
              <header class="flight-card__header">
                <span class="flight-card__heading-icon" v-html="renderIcon('plane')"></span>
                <div><span class="flight-card__type">{{ card.typeLabel }}</span><strong>{{ card.departDateLabel }}</strong></div>
                <strong class="flight-card__number">{{ card.flightNo }}</strong>
              </header>
              <div class="flight-card__route">
                <div class="flight-card__airport">
                  <span class="flight-card__caption">出發</span><strong class="flight-card__time">{{ card.departTimeLabel }}</strong>
                  <span class="flight-card__date">{{ card.departDateLabel }}</span>
                  <strong>{{ card.departAirport }}</strong><span v-if="card.departTerminal" class="flight-card__terminal">{{ card.departTerminal }}</span>
                </div>
                <div class="flight-card__connection"><span class="flight-card__path" aria-hidden="true"><span v-html="renderIcon('plane')"></span></span><span>{{ card.durationLabel }}</span></div>
                <div class="flight-card__airport flight-card__airport--arrival">
                  <span class="flight-card__caption">抵達</span><strong class="flight-card__time">{{ card.arriveTimeLabel }}</strong>
                  <span class="flight-card__date">{{ card.arriveDateLabel }}</span>
                  <strong>{{ card.arriveAirport }}</strong><span v-if="card.arriveTerminal" class="flight-card__terminal">{{ card.arriveTerminal }}</span>
                </div>
              </div>
              <footer class="flight-card__footer">
                <div class="flight-card__notes">
                  <span class="flight-card__day" :class="{ 'flight-card__day--unmatched': card.day === null }">{{ card.dayLabel || (card.day === null ? '日期未對應旅程' : 'Day ' + card.day) }}</span>
                  <p v-if="!card.isValid" class="flight-card__warning">日期或時間待確認，暫不顯示於每日行程。</p>
                  <p v-if="card.note">{{ card.note }}</p>
                </div>
                <div v-if="backendReady" class="flight-card__actions">
                  <button type="button" class="flight-icon-button" title="編輯航班" aria-label="編輯航班" :disabled="busy" @click="request('edit', card.id)"><span v-html="renderIcon('edit')"></span></button>
                  <button type="button" class="flight-icon-button flight-icon-button--danger" title="刪除航班" aria-label="刪除航班" :disabled="busy" @click="request('remove', card.id)"><span v-html="renderIcon('delete')"></span></button>
                </div>
              </footer>
            </article>
          </div>
        </div>
        <aside class="flight-itinerary-preview" aria-labelledby="flight-preview-title">
          <h3 id="flight-preview-title">每日行程</h3>
          <label class="flight-visibility-toggle">
            <input type="checkbox" :checked="allVisible" :indeterminate.prop="mixedVisibility"
              :aria-checked="mixedVisibility ? 'mixed' : allVisible" :disabled="!canWrite || !cards.length" @change="setVisibility">
            <span>同步顯示於每日行程</span>
          </label>
          <div v-for="card in previewCards" :key="card.id" class="flight-preview-day">
            <h4>{{ card.dayLabel || 'Day ' + card.day }}</h4>
            <flight-timeline :flights="[card]" @open="request('edit', $event)" />
          </div>
          <p v-if="!previewCards.length" class="flight-preview-empty">目前沒有同步的航班</p>
        </aside>
      </section>`
  };

  const FlightEditor = {
    name: 'FlightEditor',
    props: {
      form: { type: Object, required: true }, busy: Boolean,
      error: { type: String, default: '' }
    },
    emits: ['save', 'cancel'],
    setup(props, { emit }) {
      const renderIcon = window.TravelIcons.renderIcon;
      const formEl = ref(null);
      let previousFocus = null;
      let unmounted = false;
      const cancel = () => { if (!props.busy) emit('cancel'); };
      const save = () => { if (!props.busy) emit('save'); };
      const trapFocus = event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          cancel();
        }
        if (event.key !== 'Tab' || !formEl.value) return;
        const fields = Array.from(formEl.value.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'))
          .filter(el => el.getClientRects().length > 0);
        const first = fields[0];
        const last = fields[fields.length - 1];
        const active = window.document.activeElement;
        if (!first) {
          event.preventDefault();
          formEl.value.focus();
        } else if (event.shiftKey && (active === first || !fields.includes(active))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (active === last || !fields.includes(active))) {
          event.preventDefault();
          first.focus();
        }
      };
      // Disabling a focused native control can otherwise send focus to the body.
      watch(() => props.busy, busy => {
        if (busy && formEl.value && !formEl.value.contains(window.document.activeElement)) {
          formEl.value.focus({ preventScroll: true });
        }
      }, { flush: 'post' });
      onMounted(() => {
        previousFocus = window.document.activeElement;
        nextTick(() => {
          if (unmounted) return;
          (formEl.value?.querySelector('select:not(:disabled), input:not(:disabled)') || formEl.value)?.focus({ preventScroll: true });
        });
      });
      onBeforeUnmount(() => {
        unmounted = true;
        if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      });
      return { renderIcon, formEl, cancel, save, trapFocus };
    },
    template: `
      <form ref="formEl" class="flight-editor" role="dialog" aria-modal="true" aria-labelledby="flight-editor-title" tabindex="-1"
        :aria-busy="busy" @submit.prevent="save" @keydown="trapFocus">
        <header class="flight-editor__header">
          <h2 id="flight-editor-title"><span v-html="renderIcon('plane')"></span> {{ form.id ? '編輯航班' : '新增航班' }}</h2>
          <button type="button" class="flight-icon-button" title="關閉" aria-label="關閉航班編輯" :disabled="busy" @click="cancel"><span v-html="renderIcon('close')"></span></button>
        </header>
        <p v-if="error" class="flight-notice flight-notice--error" role="alert">{{ error }}</p>
        <fieldset class="flight-editor__fields" :disabled="busy">
          <div class="flight-editor__grid">
            <label class="flight-field"><span>航班類型</span><select v-model="form.flight_type" required><option value="outbound">去程</option><option value="return">回程</option><option value="other">其他航段</option></select></label>
            <label class="flight-field"><span>航班編號</span><input v-model.trim="form.flight_no" required autocomplete="off" /></label>
          </div>
          <p id="flight-local-time" class="flight-field-hint">請填寫各機場當地的日期與時間。</p>
          <fieldset class="flight-editor__leg" aria-describedby="flight-local-time">
            <legend>出發</legend>
            <label class="flight-field"><span>出發機場</span><input v-model.trim="form.depart_airport" required autocomplete="off" /></label>
            <div class="flight-editor__grid">
              <label class="flight-field"><span>出發日期</span><input v-model="form.depart_date" type="date" required /></label>
              <label class="flight-field"><span>出發時間</span><input v-model="form.depart_clock" type="time" required /></label>
              <label class="flight-field"><span>出發航廈（選填）</span><input v-model.trim="form.terminal" autocomplete="off" /></label>
            </div>
          </fieldset>
          <fieldset class="flight-editor__leg" aria-describedby="flight-local-time">
            <legend>抵達</legend>
            <label class="flight-field"><span>抵達機場</span><input v-model.trim="form.arrive_airport" required autocomplete="off" /></label>
            <div class="flight-editor__grid">
              <label class="flight-field"><span>抵達日期</span><input v-model="form.arrive_date" type="date" required /></label>
              <label class="flight-field"><span>抵達時間</span><input v-model="form.arrive_clock" type="time" required /></label>
              <label class="flight-field"><span>抵達航廈（選填）</span><input v-model.trim="form.arrive_terminal" autocomplete="off" /></label>
            </div>
          </fieldset>
          <label class="flight-field"><span>備註（選填）</span><textarea v-model.trim="form.note" rows="3"></textarea></label>
          <label class="flight-visibility-toggle"><input v-model="form.show_in_itinerary" type="checkbox" /><span>顯示於每日行程</span></label>
        </fieldset>
        <footer class="flight-editor__actions">
          <button type="button" class="flight-button" :disabled="busy" @click="cancel">取消</button>
          <button type="submit" class="flight-button flight-button--primary" :disabled="busy">{{ busy ? '儲存中...' : '儲存航班' }}</button>
        </footer>
      </form>`
  };

  window.TravelFlightUI = Object.freeze({ components: Object.freeze({ FlightPage, FlightTimeline, FlightEditor, StayTimeline }) });
})(typeof window !== 'undefined' ? window : globalThis);
