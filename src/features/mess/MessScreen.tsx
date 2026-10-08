import { useState } from 'react'
import { motion } from 'framer-motion'
import { useMessMenu } from '../../hooks/useMessMenu'
import { formatTime12, dayOffsetIST, timeToMinutes, formatIST, nowIST } from '../../lib/timeUtils'
import { fadeRise, stagger } from '../../lib/motion'
import { ListSkeleton } from '../../components/Skeleton'
import type { MessMenuDay, MealType, MessMenuItemFormatted } from '../../types'

const MEAL_EMOJI: Record<MealType, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  hi_tea: '☕',
  snacks: '☕',
  dinner: '🌙',
}

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  hi_tea: 'Hi-Tea',
  snacks: 'Hi-Tea',
  dinner: 'Dinner',
}

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function MessScreen() {
  const [selectedOffset, setSelectedOffset] = useState(0)
  const mess = useMessMenu()

  const selectedDateStr = dayOffsetIST(selectedOffset)
  const dayMenus = mess.getDayMenu(selectedDateStr)
  const currentTimeMinutes = timeToMinutes(formatIST(nowIST(), 'HH:mm'))
  const dayOffsets = [-1, 0, 1, 2, 3, 4, 5, 6]

  return (
    <div className="min-h-screen bg-surface pb-tab-bar">
      {/* Header */}
      <div className="bg-white px-5 pt-safe-top pb-0 border-b border-border sticky top-0 z-20">
        <div className="pt-3 pb-2 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-primary-text tracking-tight">Mess Menu</h1>
            <p className="text-xs text-secondary-text mt-0.5">Campus Dining & Meal Timings</p>
          </div>
          <span className="px-2.5 py-1 bg-accent/10 text-accent font-semibold text-[11px] rounded-full">
            All Campus
          </span>
        </div>

        {/* Day selector */}
        <div
          className="flex gap-1 overflow-x-auto pb-3 pt-1"
          style={{ scrollbarWidth: 'none' }}
        >
          {dayOffsets.map((offset) => {
            const date = new Date(dayOffsetIST(offset) + 'T00:00:00')
            const dayName = DAYS_SHORT[date.getDay()]
            const dayNum = date.getDate()
            const isSelected = offset === selectedOffset

            return (
              <motion.button
                key={offset}
                onClick={() => {
                  setSelectedOffset(offset)
                  mess.refresh(dayOffsetIST(offset))
                }}
                whileTap={{ scale: 0.92 }}
                className={`flex flex-col items-center px-3 py-2 rounded-xl min-w-[52px] flex-shrink-0 transition-colors ${
                  isSelected ? 'bg-accent text-white shadow-sm' : 'text-secondary-text hover:bg-surface'
                }`}
              >
                <span className="text-[10px] font-medium uppercase">{dayName}</span>
                <span className={`text-lg font-bold ${isSelected ? 'text-white' : 'text-primary-text'}`}>
                  {dayNum}
                </span>
              </motion.button>
            )
          })}
        </div>
      </div>

      {mess.loading ? (
        <div className="px-4 py-4"><ListSkeleton count={4} /></div>
      ) : dayMenus.length === 0 ? (
        <EmptyMenu />
      ) : (
        <motion.div
          key={selectedOffset}
          variants={stagger}
          initial="initial"
          animate="animate"
          className="px-4 py-4 space-y-3.5 max-w-3xl mx-auto"
        >
          {mess.mealOrder.map((mealType) => {
            const menu = dayMenus.find((m) => m.meal === mealType)
            if (!menu || !menu.items || menu.items.length === 0) return null

            const startMins = timeToMinutes(menu.start_time)
            const endMins = timeToMinutes(menu.end_time)
            const isActive = selectedOffset === 0 &&
              currentTimeMinutes >= startMins && currentTimeMinutes < endMins

            return (
              <MealCard key={mealType} menu={menu} isActive={isActive} />
            )
          })}
        </motion.div>
      )}
    </div>
  )
}

function MealCard({ menu, isActive }: { menu: MessMenuDay; isActive: boolean }) {
  const mealName = MEAL_LABELS[menu.meal] || menu.label || menu.meal

  return (
    <motion.div
      variants={fadeRise}
      className={`bg-white rounded-2xl shadow-card overflow-hidden border transition-all ${
        isActive ? 'ring-2 ring-live border-live/30' : 'border-border'
      }`}
    >
      <div className="p-4 space-y-3">
        {/* Card Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{MEAL_EMOJI[menu.meal] || '🍽'}</span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-primary-text">{mealName}</h3>
                {menu.has_special && (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <span>⭐</span> Special
                  </span>
                )}
                {menu.has_non_veg && (
                  <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                    🍗 Non-Veg / Egg
                  </span>
                )}
              </div>
              <p className="text-xs text-secondary-text mt-0.5 font-mono">
                {formatTime12(menu.start_time)} – {formatTime12(menu.end_time)}
              </p>
            </div>
          </div>
          {isActive && (
            <span className="text-xs font-bold text-live bg-live/10 px-2.5 py-1 rounded-full animate-pulse">
              ● Serving Now
            </span>
          )}
        </div>

        {/* Food Items Pill List */}
        <div className="flex flex-wrap gap-2 pt-1">
          {menu.items.map((item, i) => (
            <FoodPill key={i} item={item} />
          ))}
        </div>
      </div>
    </motion.div>
  )
}

function FoodPill({ item }: { item: MessMenuItemFormatted }) {
  const isNonVeg = item.diet === 'non_veg'
  const isEgg = item.diet === 'egg'
  const isSpecial = item.is_special

  let badgeColor = 'bg-surface text-primary-text border-border'
  let dotColor = 'bg-emerald-600'

  if (isNonVeg) {
    badgeColor = 'bg-rose-50/80 text-rose-900 border-rose-200/80 font-medium'
    dotColor = 'bg-rose-600'
  } else if (isEgg) {
    badgeColor = 'bg-amber-50/80 text-amber-900 border-amber-200/80 font-medium'
    dotColor = 'bg-amber-600'
  } else if (isSpecial) {
    badgeColor = 'bg-amber-50 text-amber-900 border-amber-300 font-semibold'
  }

  return (
    <span
      className={`text-xs px-3 py-1.5 rounded-xl border flex items-center gap-1.5 shadow-2xs transition-colors ${badgeColor}`}
      title={item.note ? `${item.name} (${item.note})` : item.name}
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
      <span>{item.name}</span>
      {item.is_special && <span className="text-[10px]">⭐</span>}
      {item.note && (
        <span className="text-[10px] text-secondary-text font-normal">({item.note})</span>
      )}
    </span>
  )
}

function EmptyMenu() {
  return (
    <motion.div
      variants={fadeRise}
      initial="initial"
      animate="animate"
      className="flex flex-col items-center justify-center py-16 text-center px-4"
    >
      <div className="text-4xl mb-3">🍽</div>
      <h3 className="text-lg font-semibold text-primary-text">No menu available</h3>
      <p className="text-sm text-secondary-text mt-1">Menu hasn't been posted for this day yet.</p>
    </motion.div>
  )
}
