/* A starter robot for rules v2, in C on WebAssembly ABI 4: it calls the
 * robot core through the clunkyard.* imports in clunkyard.h, which the
 * builder provides. It sweeps a medium scan to find a robot, narrows the
 * scan to hold it, leads it with shots whose power suits the range, fires
 * only when the turret is on target, keeps battery back for driving, looks
 * again where it last saw one, follows a passive cue when it has nothing
 * better and steps out of the storm.
 *
 * The trade-offs (the imports answer with the numbers the hello set):
 *   scan     a narrow arc reaches further; a wide one finds robots nearby
 *   power    heavy shots hit harder for less battery, but fly slowly
 *   battery  shots and driving share it, and it refills slowly
 *   turret   it turns at a limited rate; cy_gun_aim_now is where it points now
 *   fuel     every import costs fuel, so read each fact once a turn
 * A cue (cy_tracker_cue) says roughly where a robot is, within its
 * bearing_error degrees: good for where to look, not where to shoot.
 * Clunkyard WebAssembly ABI 4: the robot calls the core through imports
 * from "clunkyard", declared in clunkyard.h. Export memory and, through
 * CY_ROBOT(start, turn), clunkyard_start and clunkyard_turn. Each import
 * returns a status (CY_OK 0, CY_NONE 1 for absent) and writes results
 * through pointers; each costs fuel. In C each import is cy_<name>, as
 * cy_sensors_nearest(&contact).
 * match: match_mode match_ruleset match_control match_robots match_is_3d
 *   match_tick_rate match_max_ticks robot_id robot_seed
 * clock: clock_tick clock_seconds clock_remaining_ticks
 * arena: arena_size arena_gravity arena_terrain_kind arena_ground_height
 * me: me_health me_position me_velocity me_heading me_pitch me_roll
 *   me_angular_velocity me_attitude me_grounded me_altitude me_applied
 * battery: battery_charge battery_capacity battery_regen
 *   battery_sustainable_drive battery_compute battery_drive_cost
 * drive: drive_hover_lift drive_throttle drive_turn drive_pitch_turn
 *   drive_thrust drive_strafe drive_lift drive_yaw_torque
 *   drive_pitch_torque drive_roll_torque drive_brake drive_get_throttle
 *   drive_get_turn drive_get_pitch_turn drive_get_thrust drive_get_strafe
 *   drive_get_lift drive_get_yaw_torque drive_get_pitch_torque
 *   drive_get_roll_torque drive_get_brake
 * gun: gun_aim_now gun_cooldown_ticks gun_spread gun_max_power
 *   gun_damage_scale gun_can_fire gun_shot_speed gun_shot_cost
 *   gun_reload_ticks gun_shot_damage gun_power_for_speed
 *   gun_power_for_flight_time gun_lead gun_lead_point gun_aim_heading
 *   gun_aim_pitch gun_fire gun_power gun_get_aim_heading gun_get_aim_pitch
 *   gun_get_fire gun_get_power
 * scanner: scanner_last scanner_proximity_range scanner_reach
 *   scanner_arc_for_reach scanner_heading scanner_arc scanner_pitch
 *   scanner_get_heading scanner_get_arc scanner_get_pitch
 * sensors: sensors_contacts sensors_nearest sensors_cues sensors_contact
 *   sensors_position_of
 * tracker: tracker_cue tracker_nearest_bearing_rate tracker_velocity
 *   tracker_position tracker_last_seen tracker_configure
 * nav: nav_zone nav_zone_margin nav_zone_contains nav_zone_distance_from
 *   nav_storm nav_storm_margin nav_storm_contains nav_storm_distance_from
 *   nav_hill nav_hill_margin nav_hill_contains nav_hill_distance_from
 *   nav_pickups nav_nearest_pickup nav_field_distance
 * score: score_me score_best score_armour
 * angles: angles_normalize angles_angle_diff angles_bearing_to
 *   angles_elevation_to angles_direction angles_distance angles_clamp
 * status: status_text status_value status_get_text status_get_value
 * raw: raw_number raw_text raw_has raw_flag raw_count raw_line raw_extra
 * session: session_log
 * Records: cy_contact, cy_vec3, cy_direction and the rest, in clunkyard.h.
 * Angles are degrees from the +x axis; pitch is positive up.
 * Manual: https://clunkyard.com/manual#wasm
 */
#include "clunkyard.h"

#define SEARCH_TURN 0.33 /* enough to turn against the brake in the force rulesets */
#define MEMORY_TICKS 60  /* how long to look again where a robot was last seen */

static int free_flight;   /* flying free, robots may be above or below */
static int32_t last_slot; /* the robot seen most recently, 0 for none yet */

static double absolute(double value) { return value < 0 ? -value : value; }
static double unit(double value) { return value < -1 ? -1 : value > 1 ? 1 : value; }
static double angle_diff(double target, double current) {
  double diff = 0;
  cy_angles_angle_diff(target, current, &diff);
  return diff;
}

/* Drive towards a heading and an elevation, turning harder the smaller gain is. */
static void steer(double throttle, double heading, double elevation, double gain, double my_heading, double my_pitch) {
  cy_drive_throttle(throttle);
  cy_drive_turn(unit(angle_diff(heading, my_heading) / gain));
  cy_drive_pitch_turn(unit((elevation - my_pitch) / gain));
}

static void start(void) {
  int32_t is_3d = 0;
  cy_vec3 gravity = {0};
  cy_match_is_3d(&is_3d);
  cy_arena_gravity(&gravity);
  free_flight = is_3d && gravity.z == 0;
}

static void turn(void) {
  cy_vec3 me = {0};
  double heading = 0, pitch = 0, margin = 0;
  int32_t tick = 0, seen = 0;
  cy_me_position(&me);
  cy_me_heading(&heading);
  cy_me_pitch(&pitch);
  cy_clock_tick(&tick);
  cy_drive_brake(0.2);

  cy_contact target;
  cy_vec3 last;
  cy_cue cue;
  if (cy_sensors_nearest(&target) == CY_OK) {
    last_slot = target.slot;
    double throttle = target.range > 350 ? 0.7 : target.range < 200 ? -0.4 : 0.2;
    steer(throttle, target.bearing, target.elevation, 45, heading, pitch);
    cy_scanner_heading(target.bearing); /* narrow: holds it, reaching about 735 */
    cy_scanner_arc(20);
    cy_scanner_pitch(target.elevation);
    /* The heaviest shot that still covers the range in about a second,
     * aimed where the target will be, lobbed under gravity; straight at
     * it when no shot reaches it. */
    double power = 1;
    cy_gun_power_for_flight_time(target.range, 1, &power);
    cy_solution aim;
    if (cy_gun_lead(&target, power, &aim) != CY_OK) aim = (cy_solution){target.bearing, target.elevation, 0};
    cy_gun_aim_heading(aim.heading);
    cy_gun_aim_pitch(aim.pitch);
    cy_direction now = {0};
    int32_t can_fire = 0;
    cy_gun_aim_now(&now);
    cy_gun_can_fire(power, 10, &can_fire);
    int on_target = absolute(angle_diff(aim.heading, now.heading)) < 3 && absolute(aim.pitch - now.pitch) < 3;
    if (on_target && can_fire) {
      cy_gun_fire();
      cy_gun_power(power);
    }
  } else if (last_slot && cy_tracker_last_seen(last_slot, &seen) == CY_OK && tick - seen < MEMORY_TICKS &&
             cy_tracker_position(last_slot, &last) == CY_OK) {
    /* Head for where it was, sweeping a narrow scan across that bearing. */
    double bearing = 0, elevation = 0;
    cy_angles_bearing_to(&me, &last, &bearing);
    if (free_flight) cy_angles_elevation_to(&me, &last, &elevation);
    steer(0.7, bearing, elevation, 45, heading, pitch);
    cy_scanner_heading(bearing + (tick % 5 - 2) * 8);
    cy_scanner_arc(30);
    cy_scanner_pitch(elevation);
  } else if (cy_tracker_cue(&cue) == CY_OK) {
    /* Head the way the cue points, sweeping the scan across its error. */
    double bearing = 0, elevation = 0;
    cy_angles_bearing_to(&me, &cue.position, &bearing);
    if (free_flight) cy_angles_elevation_to(&me, &cue.position, &elevation);
    double error = cue.bearing_error < 30 ? cue.bearing_error : 30;
    steer(0.6, bearing, elevation, 45, heading, pitch);
    cy_scanner_heading(bearing + (tick % 5 - 2) / 2.0 * error);
    cy_scanner_arc(30);
    cy_scanner_pitch(elevation);
  } else {
    steer(0.5, heading, 0, 45, heading, pitch);
    cy_drive_turn(SEARCH_TURN);
    /* Sweeps the circle in half a second, flying free at three heights in turn. */
    cy_scan scan = {0};
    cy_scanner_last(&scan);
    cy_scanner_heading(scan.heading + 36);
    cy_scanner_arc(40);
    cy_scanner_pitch(free_flight ? ((tick / 10) % 3 - 1) * 35 : 0);
  }

  /* Low battery: drive gently so the shots can still be paid for. */
  double charge = 0, capacity = 0;
  cy_battery_charge(&charge);
  cy_battery_capacity(&capacity);
  if (charge < capacity / 4) {
    double throttle = 0;
    cy_drive_get_throttle(&throttle);
    cy_drive_throttle(throttle * 0.5);
  }

  /* The storm drifts across the arena and hurts anything inside it. Near its
   * edge, step out across its path: at right angles to its drift, on the
   * side this robot is already on, so it passes by. */
  cy_storm storm;
  if (cy_nav_storm(&storm) == CY_OK && cy_nav_storm_margin(&me, &margin) == CY_OK && margin > -60) {
    const cy_vec3 still = {0};
    double away = 0, drift = 0;
    cy_angles_bearing_to(&storm.center, &me, &away);
    cy_angles_bearing_to(&still, &storm.velocity, &drift);
    steer(1, drift + (angle_diff(away, drift) < 0 ? -90 : 90), 0, 30, heading, pitch);
  }

  /* Sudden death: head back inside the safe zone. */
  cy_zone zone;
  if (cy_nav_zone(&zone) == CY_OK && cy_nav_zone_margin(&me, &margin) == CY_OK && margin < 60) {
    double bearing = 0, climb = 0;
    cy_angles_bearing_to(&me, &zone.center, &bearing);
    if (zone.shape == CY_SHAPE_SPHERE) cy_angles_elevation_to(&me, &zone.center, &climb);
    steer(0.8, bearing, climb, 30, heading, pitch);
  }
}

CY_ROBOT(start, turn)
