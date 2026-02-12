
# Forklift Rental ERP — Fleet Management

## Overview
A modern, visual ERP system for managing a forklift rental fleet. Built with a real Supabase database for persistent data. Starting focused on fleet management with room to grow.

---

## Pages & Features

### 1. Dashboard
- Overview cards showing key stats: total forklifts, currently rented, available, in maintenance
- Visual charts (pie chart for fleet status breakdown, bar chart for rentals over time)
- Quick-action buttons to add a forklift or log a status change

### 2. Fleet Inventory
- Table/grid view of all forklifts with colorful status badges (Available = green, Rented = blue, Maintenance = orange, Retired = gray)
- Each forklift shows: name/ID, model, capacity, fuel type, mast height, year, current status
- Search and filter by status, model, or specs
- Click a forklift to see its full detail page

### 3. Forklift Detail Page
- Full specs card with all equipment details
- Status history timeline
- Rental pricing section (daily / weekly / monthly rates)
- Edit forklift info and pricing inline

### 4. Availability Calendar
- Visual calendar view showing which forklifts are booked and when
- Color-coded by status
- Click a date range to see available forklifts for that period

### 5. Add/Edit Forklift Form
- Form to add a new forklift or edit an existing one
- Fields: name/ID, model, manufacturer, year, capacity, mast height, fuel type, serial number
- Set rental rates (daily, weekly, monthly)
- Set initial status

---

## Database (Supabase)
- **Forklifts table**: stores all forklift details, specs, and pricing
- **Status log table**: tracks status changes over time (who changed it, when, from/to)
- **Bookings table**: date ranges when a forklift is reserved/rented (for calendar view)

---

## Design
- Modern, visual style with a sidebar navigation
- Colorful status badges and progress indicators
- Charts on the dashboard using Recharts
- Clean cards and tables with hover effects
- Responsive layout for desktop use
