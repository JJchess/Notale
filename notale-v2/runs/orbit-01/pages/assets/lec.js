(function (root) {
    "use strict";

    var K = {};

    K.ZERO = 0;
    K.ONE = 1;
    K.TWO = 2;
    K.THREE = 3;
    K.FOUR = 4;
    K.SIX = 6;
    K.EIGHT = 8;
    K.TEN = 10;
    K.HUNDRED = 100;
    K.THOUSAND = 1000;
    K.MILLION = 1000000;
    K.PI = 3.141592653589793;
    K.TWO_PI = 6.283185307179586;
    K.HALF_PI = 1.5707963267948966;
    K.HALF = 0.5;
    K.ONE_THIRD = 0.3333333333333333;
    K.DEG_TO_RAD = 0.017453292519943295;
    K.RAD_TO_DEG = 57.29577951308232;
    K.PAGE_TOTAL = 20;
    K.PAGE_DIGITS = 2;
    K.DISPLAY_DECIMALS = 2;

    K.M = 1;
    K.KM = 1000;
    K.CM = 0.01;
    K.MM = 0.001;
    K.MICROMETER = 0.000001;
    K.S = 1;
    K.MS = 0.001;
    K.MINUTE = 60;
    K.HOUR = 3600;
    K.DAY = 86400;
    K.SIDEREAL_DAY = 86164.0905;
    K.YEAR = 31557600;

    K.KG = 1;
    K.GRAM = 0.001;
    K.TONNE = 1000;
    K.N = 1;
    K.KN = 1000;
    K.MN = 1000000;
    K.J = 1;
    K.KJ = 1000;
    K.MJ = 1000000;
    K.GJ = 1000000000;
    K.W = 1;
    K.KW = 1000;
    K.MW = 1000000;
    K.PA = 1;
    K.KPA = 1000;
    K.MPA = 1000000;
    K.BAR = 100000;
    K.L = 0.001;
    K.CUBIC_M = 1;

    K.G = 6.67430e-11;
    K.G0 = 9.80665;
    K.C = 299792458;
    K.K_BOLTZMANN = 1.380649e-23;
    K.STEFAN_BOLTZMANN = 5.670374419e-8;

    K.M_EARTH = 5.9722e24;
    K.R_EARTH = 6371000;
    K.R_EARTH_EQUATORIAL = 6378137;
    K.R_EARTH_POLAR = 6356752.314;
    K.MU_EARTH = 3.986004418e14;
    K.OMEGA_EARTH = 7.2921150e-5;
    K.SIDEREAL_ROTATION_PERIOD = 86164.0905;
    K.ESCAPE_VELOCITY_EARTH = 11186;
    K.EARTH_SURFACE_AREA = 510064471000000;
    K.EARTH_SURFACE_GRAVITY = 9.80665;

    K.M_MOON = 7.342e22;
    K.R_MOON = 1737400;
    K.MU_MOON = 4.9048695e12;
    K.MOON_SURFACE_GRAVITY = 1.625;
    K.MOON_DISTANCE = 384400000;
    K.MOON_ORBITAL_PERIOD = 2360592;

    K.M_SUN = 1.98847e30;
    K.R_SUN = 696340000;
    K.MU_SUN = 1.32712440018e20;
    K.AU = 149597870700;
    K.EARTH_ORBITAL_SPEED = 29785;
    K.EARTH_ORBITAL_PERIOD = 31558149.8;
    K.SOLAR_ESCAPE_VELOCITY_AT_AU = 42100;

    K.ATMOSPHERE_SEA_LEVEL_DENSITY = 1.225;
    K.ATMOSPHERE_SEA_LEVEL_PRESSURE = 101325;
    K.ATMOSPHERE_SEA_LEVEL_TEMPERATURE = 288.15;
    K.ATMOSPHERE_GAS_CONSTANT = 287.05287;
    K.ATMOSPHERE_MOLAR_MASS = 0.0289644;
    K.ATMOSPHERE_GAMMA = 1.4;
    K.ATMOSPHERE_LAPSE_RATE = 0.0065;
    K.ATMOSPHERE_SCALE_HEIGHT = 8500;
    K.ATMOSPHERE_TROPOPAUSE_ALTITUDE = 11000;
    K.ATMOSPHERE_TROPOPAUSE_TEMPERATURE = 216.65;
    K.ATMOSPHERE_TROPOPAUSE_PRESSURE = 22632.06;
    K.ATMOSPHERE_TEMPERATURE_SPACE = 2.7;
    K.ATMOSPHERE_REFERENCE_ALTITUDE = 0;

    K.LOW_EARTH_ORBIT_ALTITUDE = 200000;
    K.ISS_ALTITUDE = 400000;
    K.GEO_ALTITUDE = 35786000;
    K.GEO_ORBITAL_PERIOD = 86164.0905;
    K.GEO_INCLINATION = 0;
    K.MOON_ORBIT_ALTITUDE = 100000;
    K.LUNAR_DISTANCE = 384400000;

    K.TYPICAL_LEO_SPEED = 7780;
    K.TYPICAL_LEO_PERIOD = 5550;
    K.TYPICAL_ESCAPE_DELTA_V = 11186;
    K.TYPICAL_LEO_DELTA_V = 9400;
    K.TYPICAL_GRAVITY_LOSS = 1500;
    K.TYPICAL_DRAG_LOSS = 150;
    K.TYPICAL_STEERING_LOSS = 200;

    K.BODIES = {
        earth: {
            name: "Earth",
            mass: K.M_EARTH,
            radius: K.R_EARTH,
            mu: K.MU_EARTH,
            surfaceGravity: K.EARTH_SURFACE_GRAVITY
        },
        moon: {
            name: "Moon",
            mass: K.M_MOON,
            radius: K.R_MOON,
            mu: K.MU_MOON,
            surfaceGravity: K.MOON_SURFACE_GRAVITY
        },
        sun: {
            name: "Sun",
            mass: K.M_SUN,
            radius: K.R_SUN,
            mu: K.MU_SUN
        }
    };

    K.UNITS = {
        m: K.M,
        km: K.KM,
        cm: K.CM,
        mm: K.MM,
        s: K.S,
        minute: K.MINUTE,
        hour: K.HOUR,
        day: K.DAY,
        kg: K.KG,
        gram: K.GRAM,
        tonne: K.TONNE,
        n: K.N,
        kn: K.KN,
        j: K.J,
        kj: K.KJ,
        mj: K.MJ,
        pa: K.PA,
        kpa: K.KPA,
        bar: K.BAR
    };

    var P = {};

    P.isFinite = function (value) {
        return typeof value === "number" && isFinite(value);
    };

    P.isPositive = function (value) {
        return P.isFinite(value) && value > K.ZERO;
    };

    P.isNonNegative = function (value) {
        return P.isFinite(value) && value >= K.ZERO;
    };

    P.clamp = function (value, minimum, maximum) {
        if (value < minimum) {
            return minimum;
        }
        if (value > maximum) {
            return maximum;
        }
        return value;
    };

    P.degreesToRadians = function (degrees) {
        return degrees * K.DEG_TO_RAD;
    };

    P.radiansToDegrees = function (radians) {
        return radians * K.RAD_TO_DEG;
    };

    P.kilometersToMeters = function (kilometers) {
        return kilometers * K.KM;
    };

    P.metersToKilometers = function (meters) {
        return meters / K.KM;
    };

    P.centimetersToMeters = function (centimeters) {
        return centimeters * K.CM;
    };

    P.metersToCentimeters = function (meters) {
        return meters / K.CM;
    };

    P.millimetersToMeters = function (millimeters) {
        return millimeters * K.MM;
    };

    P.metersToMillimeters = function (meters) {
        return meters / K.MM;
    };

    P.gramsToKilograms = function (grams) {
        return grams * K.GRAM;
    };

    P.kilogramsToGrams = function (kilograms) {
        return kilograms / K.GRAM;
    };

    P.tonnesToKilograms = function (tonnes) {
        return tonnes * K.TONNE;
    };

    P.kilogramsToTonnes = function (kilograms) {
        return kilograms / K.TONNE;
    };

    P.minutesToSeconds = function (minutes) {
        return minutes * K.MINUTE;
    };

    P.hoursToSeconds = function (hours) {
        return hours * K.HOUR;
    };

    P.daysToSeconds = function (days) {
        return days * K.DAY;
    };

    P.secondsToMinutes = function (seconds) {
        return seconds / K.MINUTE;
    };

    P.secondsToHours = function (seconds) {
        return seconds / K.HOUR;
    };

    P.secondsToDays = function (seconds) {
        return seconds / K.DAY;
    };

    P.kilometersPerHourToMetersPerSecond = function (speed) {
        return speed / 3.6;
    };

    P.metersPerSecondToKilometersPerHour = function (speed) {
        return speed * 3.6;
    };

    P.megajoulesToJoules = function (energy) {
        return energy * K.MJ;
    };

    P.joulesToMegajoules = function (energy) {
        return energy / K.MJ;
    };

    P.bodyMu = function (body) {
        if (body && P.isPositive(body.mu)) {
            return body.mu;
        }
        return K.MU_EARTH;
    };

    P.bodyRadius = function (body) {
        if (body && P.isPositive(body.radius)) {
            return body.radius;
        }
        return K.R_EARTH;
    };

    P.bodyGravity = function (body) {
        if (body && P.isPositive(body.surfaceGravity)) {
            return body.surfaceGravity;
        }
        return P.gravityAtRadius(P.bodyRadius(body), P.bodyMu(body));
    };

    P.radiusAtAltitude = function (altitude, body) {
        return P.bodyRadius(body) + altitude;
    };

    P.altitudeFromRadius = function (radius, body) {
        return radius - P.bodyRadius(body);
    };

    P.gravityAtRadius = function (radius, gravitationalParameter) {
        var mu = P.isPositive(gravitationalParameter) ? gravitationalParameter : K.MU_EARTH;
        return mu / (radius * radius);
    };

    P.gravityAtAltitude = function (altitude, body) {
        var radius = P.radiusAtAltitude(altitude, body);
        return P.gravityAtRadius(radius, P.bodyMu(body));
    };

    P.weight = function (mass, gravitationalAcceleration) {
        var g = P.isPositive(gravitationalAcceleration) ? gravitationalAcceleration : K.G0;
        return mass * g;
    };

    P.massFromWeight = function (force, gravitationalAcceleration) {
        var g = P.isPositive(gravitationalAcceleration) ? gravitationalAcceleration : K.G0;
        return force / g;
    };

    P.gravitationalForce = function (massOne, massTwo, distance) {
        return K.G * massOne * massTwo / (distance * distance);
    };

    P.gravitationalPotential = function (mass, radius, gravitationalParameter) {
        return -P.bodyMu(null, gravitationalParameter) * mass / radius;
    };

    P.kineticEnergy = function (mass, speed) {
        return K.HALF * mass * speed * speed;
    };

    P.momentum = function (mass, speed) {
        return mass * speed;
    };

    P.impulse = function (force, duration) {
        return force * duration;
    };

    P.power = function (energy, duration) {
        return energy / duration;
    };

    P.circularVelocity = function (radius, gravitationalParameter) {
        var mu = P.isPositive(gravitationalParameter) ? gravitationalParameter : K.MU_EARTH;
        return Math.sqrt(mu / radius);
    };

    P.circularVelocityAtAltitude = function (altitude, body) {
        return P.circularVelocity(P.radiusAtAltitude(altitude, body), P.bodyMu(body));
    };

    P.escapeVelocity = function (radius, gravitationalParameter) {
        var mu = P.isPositive(gravitationalParameter) ? gravitationalParameter : K.MU_EARTH;
        return Math.sqrt(K.TWO * mu / radius);
    };

    P.escapeVelocityAtAltitude = function (altitude, body) {
        return P.escapeVelocity(P.radiusAtAltitude(altitude, body), P.bodyMu(body));
    };

    P.visVivaVelocity = function (radius, semiMajorAxis, gravitationalParameter) {
        var mu = P.isPositive(gravitationalParameter) ? gravitationalParameter : K.MU_EARTH;
        return Math.sqrt(mu * (K.TWO / radius - K.ONE / semiMajorAxis));
    };

    P.visVivaVelocityAtAltitude = function (altitude, semiMajorAxis, body) {
        return P.visVivaVelocity(
            P.radiusAtAltitude(altitude, body),
            semiMajorAxis,
            P.bodyMu(body)
        );
    };

    P.specificOrbitalEnergy = function (radius, speed, gravitationalParameter) {
        var mu = P.isPositive(gravitationalParameter) ? gravitationalParameter : K.MU_EARTH;
        return speed * speed * K.HALF - mu / radius;
    };

    P.orbitalEnergy = function (mass, radius, speed, gravitationalParameter) {
        return mass * P.specificOrbitalEnergy(radius, speed, gravitationalParameter);
    };

    P.specificOrbitalEnergyFromSemiMajorAxis = function (semiMajorAxis, gravitationalParameter) {
        var mu = P.isPositive(gravitationalParameter) ? gravitationalParameter : K.MU_EARTH;
        return -mu / (K.TWO * semiMajorAxis);
    };

    P.orbitalPeriod = function (semiMajorAxis, gravitationalParameter) {
        var mu = P.isPositive(gravitationalParameter) ? gravitationalParameter : K.MU_EARTH;
        return K.TWO_PI * Math.sqrt(
            semiMajorAxis * semiMajorAxis * semiMajorAxis / mu
        );
    };

    P.orbitalPeriodAtAltitude = function (altitude, body) {
        var radius = P.radiusAtAltitude(altitude, body);
        return P.orbitalPeriod(radius, P.bodyMu(body));
    };

    P.orbitalRadiusForPeriod = function (period, gravitationalParameter) {
        var mu = P.isPositive(gravitationalParameter) ? gravitationalParameter : K.MU_EARTH;
        return Math.pow(
            mu * period * period / (K.TWO_PI * K.TWO_PI),
            K.ONE_THIRD
        );
    };

    P.orbitalAltitudeForPeriod = function (period, body) {
        return P.orbitalRadiusForPeriod(period, P.bodyMu(body)) - P.bodyRadius(body);
    };

    P.meanMotion = function (semiMajorAxis, gravitationalParameter) {
        var mu = P.isPositive(gravitationalParameter) ? gravitationalParameter : K.MU_EARTH;
        return Math.sqrt(mu / Math.pow(semiMajorAxis, K.THREE));
    };

    P.specificAngularMomentum = function (radius, speed, flightPathAngle) {
        var angle = P.isFinite(flightPathAngle) ? flightPathAngle : K.ZERO;
        return radius * speed * Math.cos(angle);
    };

    P.eccentricityFromApsides = function (periapsisRadius, apoapsisRadius) {
        return (
            apoapsisRadius - periapsisRadius
        ) / (
            apoapsisRadius + periapsisRadius
        );
    };

    P.semiMajorAxisFromApsides = function (periapsisRadius, apoapsisRadius) {
        return K.HALF * (periapsisRadius + apoapsisRadius);
    };

    P.periapsisFromApsis = function (semiMajorAxis, eccentricity) {
        return semiMajorAxis * (K.ONE - eccentricity);
    };

    P.apoapsisFromApsis = function (semiMajorAxis, eccentricity) {
        return semiMajorAxis * (K.ONE + eccentricity);
    };

    P.orbitalElementsFromApsides = function (
        periapsisRadius,
        apoapsisRadius,
        gravitationalParameter
    ) {
        var mu = P.isPositive(gravitationalParameter) ? gravitationalParameter : K.MU_EARTH;
        var semiMajorAxis = P.semiMajorAxisFromApsides(
            periapsisRadius,
            apoapsisRadius
        );
        var eccentricity = P.eccentricityFromApsides(
            periapsisRadius,
            apoapsisRadius
        );

        return {
            periapsisRadius: periapsisRadius,
            apoapsisRadius: apoapsisRadius,
            semiMajorAxis: semiMajorAxis,
            eccentricity: eccentricity,
            period: P.orbitalPeriod(semiMajorAxis, mu),
            periapsisVelocity: P.visVivaVelocity(periapsisRadius, semiMajorAxis, mu),
            apoapsisVelocity: P.visVivaVelocity(apoapsisRadius, semiMajorAxis, mu)
        };
    };

    P.eccentricityFromState = function (
        radius,
        speed,
        specificAngularMomentum,
        gravitationalParameter
    ) {
        var mu = P.isPositive(gravitationalParameter) ? gravitationalParameter : K.MU_EARTH;
        var energy = P.specificOrbitalEnergy(radius, speed, mu);
        return Math.sqrt(
            K.ONE + K.TWO * energy * specificAngularMomentum * specificAngularMomentum /
            (mu * mu)
        );
    };

    P.hohmannTransfer = function (
        initialRadius,
        finalRadius,
        gravitationalParameter
    ) {
        var mu = P.isPositive(gravitationalParameter) ? gravitationalParameter : K.MU_EARTH;
        var transferSemiMajorAxis;
        var initialCircularSpeed;
        var finalCircularSpeed;
        var transferSpeedAtInitial;
        var transferSpeedAtFinal;
        var firstBurn;
        var secondBurn;
        var transferTime;

        transferSemiMajorAxis = K.HALF * (initialRadius + finalRadius);
        initialCircularSpeed = P.circularVelocity(initialRadius, mu);
        finalCircularSpeed = P.circularVelocity(finalRadius, mu);
        transferSpeedAtInitial = P.visVivaVelocity(
            initialRadius,
            transferSemiMajorAxis,
            mu
        );
        transferSpeedAtFinal = P.visVivaVelocity(
            finalRadius,
            transferSemiMajorAxis,
            mu
        );
        firstBurn = Math.abs(transferSpeedAtInitial - initialCircularSpeed);
        secondBurn = Math.abs(finalCircularSpeed - transferSpeedAtFinal);
        transferTime = K.PI * Math.sqrt(
            transferSemiMajorAxis * transferSemiMajorAxis * transferSemiMajorAxis / mu
        );

        return {
            initialRadius: initialRadius,
            finalRadius: finalRadius,
            transferSemiMajorAxis: transferSemiMajorAxis,
            initialCircularSpeed: initialCircularSpeed,
            finalCircularSpeed: finalCircularSpeed,
            transferSpeedAtInitial: transferSpeedAtInitial,
            transferSpeedAtFinal: transferSpeedAtFinal,
            firstBurn: firstBurn,
            secondBurn: secondBurn,
            totalDeltaV: firstBurn + secondBurn,
            transferTime: transferTime
        };
    };

    P.hohmannTransferFromAltitudes = function (
        initialAltitude,
        finalAltitude,
        body
    ) {
        var radius = P.bodyRadius(body);
        var mu = P.bodyMu(body);

        return P.hohmannTransfer(
            radius + initialAltitude,
            radius + finalAltitude,
            mu
        );
    };

    P.planeChangeDeltaV = function (speed, inclinationChange) {
        return K.TWO * speed * Math.sin(Math.abs(inclinationChange) * K.HALF);
    };

    P.combinedPlaneChangeDeltaV = function (
        speedBefore,
        speedAfter,
        inclinationChange
    ) {
        return Math.sqrt(
            speedBefore * speedBefore +
            speedAfter * speedAfter -
            K.TWO * speedBefore * speedAfter *
            Math.cos(inclinationChange)
        );
    };

    P.geostationaryRadius = function (gravitationalParameter, rotationPeriod) {
        var mu = P.isPositive(gravitationalParameter) ? gravitationalParameter : K.MU_EARTH;
        var period = P.isPositive(rotationPeriod) ? rotationPeriod : K.SIDEREAL_DAY;

        return Math.pow(
            mu * period * period / (K.TWO_PI * K.TWO_PI),
            K.ONE_THIRD
        );
    };

    P.geostationaryAltitude = function (body, rotationPeriod) {
        return P.geostationaryRadius(
            P.bodyMu(body),
            rotationPeriod
        ) - P.bodyRadius(body);
    };

    P.surfaceRotationSpeed = function (latitude, body) {
        var radius = P.bodyRadius(body);
        var angularVelocity = K.OMEGA_EARTH;

        return angularVelocity * radius * Math.cos(latitude);
    };

    P.surfaceRotationSpeedAtLatitude = function (latitudeDegrees, body) {
        return P.surfaceRotationSpeed(
            P.degreesToRadians(latitudeDegrees),
            body
        );
    };

    P.rotationBenefit = function (latitude, body) {
        return P.surfaceRotationSpeed(latitude, body);
    };

    P.rotationBenefitAtLatitude = function (latitudeDegrees, body) {
        return P.surfaceRotationSpeedAtLatitude(latitudeDegrees, body);
    };

    P.rotationPeriodFromAngularVelocity = function (angularVelocity) {
        return K.TWO_PI / angularVelocity;
    };

    P.escapeSpeedFromInfinitySpeed = function (
        radius,
        infinitySpeed,
        gravitationalParameter
    ) {
        var escape = P.escapeVelocity(radius, gravitationalParameter);
        return Math.sqrt(escape * escape + infinitySpeed * infinitySpeed);
    };

    P.hyperbolicExcessSpeed = function (
        radius,
        speed,
        gravitationalParameter
    ) {
        var mu = P.isPositive(gravitationalParameter) ? gravitationalParameter : K.MU_EARTH;
        var value = speed * speed - K.TWO * mu / radius;

        return value > K.ZERO ? Math.sqrt(value) : K.ZERO;
    };

    P.characteristicEnergy = function (infinitySpeed) {
        return infinitySpeed * infinitySpeed;
    };

    P.rocketExhaustVelocity = function (specificImpulse, gravitationalAcceleration) {
        var g = P.isPositive(gravitationalAcceleration) ?
            gravitationalAcceleration :
            K.G0;

        return specificImpulse * g;
    };

    P.rocketDeltaV = function (
        specificImpulse,
        initialMass,
        finalMass,
        gravitationalAcceleration
    ) {
        var exhaustVelocity = P.rocketExhaustVelocity(
            specificImpulse,
            gravitationalAcceleration
        );

        return exhaustVelocity * Math.log(initialMass / finalMass);
    };

    P.massRatioFromDeltaV = function (
        deltaV,
        specificImpulse,
        gravitationalAcceleration
    ) {
        var exhaustVelocity = P.rocketExhaustVelocity(
            specificImpulse,
            gravitationalAcceleration
        );

        return Math.exp(deltaV / exhaustVelocity);
    };

    P.finalMassForDeltaV = function (
        initialMass,
        deltaV,
        specificImpulse,
        gravitationalAcceleration
    ) {
        return initialMass / P.massRatioFromDeltaV(
            deltaV,
            specificImpulse,
            gravitationalAcceleration
        );
    };

    P.initialMassForDeltaV = function (
        finalMass,
        deltaV,
        specificImpulse,
        gravitationalAcceleration
    ) {
        return finalMass * P.massRatioFromDeltaV(
            deltaV,
            specificImpulse,
            gravitationalAcceleration
        );
    };

    P.propellantMassForDeltaV = function (
        initialMass,
        deltaV,
        specificImpulse,
        gravitationalAcceleration
    ) {
        return initialMass - P.finalMassForDeltaV(
            initialMass,
            deltaV,
            specificImpulse,
            gravitationalAcceleration
        );
    };

    P.specificImpulseFromDeltaV = function (
        deltaV,
        initialMass,
        finalMass,
        gravitationalAcceleration
    ) {
        var g = P.isPositive(gravitationalAcceleration) ?
            gravitationalAcceleration :
            K.G0;

        return deltaV / (g * Math.log(initialMass / finalMass));
    };

    P.propellantFraction = function (initialMass, finalMass) {
        return (initialMass - finalMass) / initialMass;
    };

    P.payloadFraction = function (payloadMass, totalMass) {
        return payloadMass / totalMass;
    };

    P.stageMassRatio = function (wetMass, dryMass, upperMass) {
        var upper = P.isNonNegative(upperMass) ? upperMass : K.ZERO;
        return (wetMass + upper) / (dryMass + upper);
    };

    P.stageDeltaV = function (stage, upperMass, gravitationalAcceleration) {
        var upper = P.isNonNegative(upperMass) ? upperMass : K.ZERO;
        var wetMass = stage.wetMass;
        var dryMass = stage.dryMass;
        var initialMass;
        var finalMass;

        if (!P.isPositive(wetMass) &&
            P.isPositive(stage.propellantMass) &&
            P.isPositive(dryMass)) {
            wetMass = stage.propellantMass + dryMass;
        }

        initialMass = wetMass + upper;
        finalMass = dryMass + upper;

        return P.rocketDeltaV(
            stage.specificImpulse,
            initialMass,
            finalMass,
            gravitationalAcceleration
        );
    };

    P.multistageDeltaV = function (
        stages,
        payloadMass,
        gravitationalAcceleration
    ) {
        var results = [];
        var upperMass = P.isNonNegative(payloadMass) ? payloadMass : K.ZERO;
        var totalDeltaV = K.ZERO;
        var i;
        var stage;
        var wetMass;
        var dryMass;
        var initialMass;
        var finalMass;
        var deltaV;

        for (i = stages.length - K.ONE; i >= K.ZERO; i -= K.ONE) {
            stage = stages[i];
            wetMass = stage.wetMass;

            if (!P.isPositive(wetMass) &&
                P.isPositive(stage.propellantMass) &&
                P.isPositive(stage.dryMass)) {
                wetMass = stage.propellantMass + stage.dryMass;
            }

            dryMass = stage.dryMass;
            initialMass = wetMass + upperMass;
            finalMass = dryMass + upperMass;
            deltaV = P.rocketDeltaV(
                stage.specificImpulse,
                initialMass,
                finalMass,
                gravitationalAcceleration
            );

            results.unshift({
                index: i,
                wetMass: wetMass,
                dryMass: dryMass,
                upperMass: upperMass,
                initialMass: initialMass,
                finalMass: finalMass,
                massRatio: initialMass / finalMass,
                deltaV: deltaV
            });

            totalDeltaV += deltaV;
            upperMass += wetMass;
        }

        return {
            stages: results,
            payloadMass: payloadMass,
            totalDeltaV: totalDeltaV,
            initialStackMass: upperMass
        };
    };

    P.thrustFromMassFlow = function (
        massFlow,
        specificImpulse,
        gravitationalAcceleration
    ) {
        return massFlow * P.rocketExhaustVelocity(
            specificImpulse,
            gravitationalAcceleration
        );
    };

    P.massFlowFromThrust = function (
        thrust,
        specificImpulse,
        gravitationalAcceleration
    ) {
        return thrust / P.rocketExhaustVelocity(
            specificImpulse,
            gravitationalAcceleration
        );
    };

    P.thrustToWeight = function (
        thrust,
        mass,
        gravitationalAcceleration
    ) {
        var g = P.isPositive(gravitationalAcceleration) ?
            gravitationalAcceleration :
            K.G0;

        return thrust / (mass * g);
    };

    P.accelerationFromThrust = function (
        thrust,
        mass
    ) {
        return thrust / mass;
    };

    P.netAcceleration = function (
        thrust,
        mass,
        gravitationalAcceleration,
        drag
    ) {
        var g = P.isPositive(gravitationalAcceleration) ?
            gravitationalAcceleration :
            K.G0;
        var aerodynamicDrag = P.isNonNegative(drag) ? drag : K.ZERO;

        return thrust / mass - g - aerodynamicDrag / mass;
    };

    P.burnTime = function (propellantMass, massFlow) {
        return propellantMass / massFlow;
    };

    P.burnedMass = function (massFlow, duration) {
        return massFlow * duration;
    };

    P.totalImpulse = function (thrust, duration) {
        return thrust * duration;
    };

    P.averageThrust = function (totalImpulse, duration) {
        return totalImpulse / duration;
    };

    P.gravityLoss = function (gravitationalAcceleration, duration) {
        var g = P.isPositive(gravitationalAcceleration) ?
            gravitationalAcceleration :
            K.G0;

        return g * duration;
    };

    P.dragLoss = function (
        drag,
        mass,
        duration
    ) {
        return drag / mass * duration;
    };

    P.steeringLoss = function (speed, flightPathAngle) {
        return speed * (K.ONE - Math.cos(flightPathAngle));
    };

    P.launchDeltaV = function (
        orbitalSpeed,
        gravityLossValue,
        dragLossValue,
        steeringLossValue,
        rotationBenefitValue
    ) {
        var gravityLossAmount = P.isNonNegative(gravityLossValue) ?
            gravityLossValue :
            K.ZERO;
        var dragLossAmount = P.isNonNegative(dragLossValue) ?
            dragLossValue :
            K.ZERO;
        var steeringLossAmount = P.isNonNegative(steeringLossValue) ?
            steeringLossValue :
            K.ZERO;
        var rotationAmount = P.isNonNegative(rotationBenefitValue) ?
            rotationBenefitValue :
            K.ZERO;

        return orbitalSpeed +
            gravityLossAmount +
            dragLossAmount +
            steeringLossAmount -
            rotationAmount;
    };

    P.deltaVBudget = function (orbitalSpeed, losses) {
        var total = orbitalSpeed;
        var values = losses || {};
        var names = [
            "gravity",
            "drag",
            "steering",
            "maneuver",
            "landing"
        ];
        var i;
        var value;

        for (i = K.ZERO; i < names.length; i += K.ONE) {
            value = values[names[i]];
            if (P.isNonNegative(value)) {
                total += value;
            }
        }

        return {
            orbitalSpeed: orbitalSpeed,
            gravityLoss: values.gravity || K.ZERO,
            dragLoss: values.drag || K.ZERO,
            steeringLoss: values.steering || K.ZERO,
            maneuverLoss: values.maneuver || K.ZERO,
            landingLoss: values.landing || K.ZERO,
            total: total
        };
    };

    P.airTemperature = function (altitude) {
        var h = Math.max(K.ZERO, altitude);
        var tropopause = K.ATMOSPHERE_TROPOPAUSE_ALTITUDE;

        if (h <= tropopause) {
            return K.ATMOSPHERE_SEA_LEVEL_TEMPERATURE -
                K.ATMOSPHERE_LAPSE_RATE * h;
        }

        return K.ATMOSPHERE_TROPOPAUSE_TEMPERATURE;
    };

    P.airPressure = function (altitude) {
        var h = Math.max(K.ZERO, altitude);
        var tropopause = K.ATMOSPHERE_TROPOPAUSE_ALTITUDE;
        var temperature;
        var exponent;

        if (h <= tropopause) {
            temperature = P.airTemperature(h);
            exponent = K.G0 / (
                K.ATMOSPHERE_GAS_CONSTANT *
                K.ATMOSPHERE_LAPSE_RATE
            );

            return K.ATMOSPHERE_SEA_LEVEL_PRESSURE *
                Math.pow(
                    temperature / K.ATMOSPHERE_SEA_LEVEL_TEMPERATURE,
                    exponent
                );
        }

        return K.ATMOSPHERE_TROPOPAUSE_PRESSURE *
            Math.exp(
                -K.G0 * (h - tropopause) /
                (
                    K.ATMOSPHERE_GAS_CONSTANT *
                    K.ATMOSPHERE_TROPOPAUSE_TEMPERATURE
                )
            );
    };

    P.airDensity = function (altitude) {
        var h = Math.max(K.ZERO, altitude);
        var pressure = P.airPressure(h);
        var temperature = P.airTemperature(h);

        return pressure / (
            K.ATMOSPHERE_GAS_CONSTANT *
            temperature
        );
    };

    P.exponentialAirDensity = function (altitude) {
        var h = Math.max(K.ZERO, altitude);

        return K.ATMOSPHERE_SEA_LEVEL_DENSITY *
            Math.exp(-h / K.ATMOSPHERE_SCALE_HEIGHT);
    };

    P.exponentialAirPressure = function (altitude) {
        var h = Math.max(K.ZERO, altitude);

        return K.ATMOSPHERE_SEA_LEVEL_PRESSURE *
            Math.exp(-h / K.ATMOSPHERE_SCALE_HEIGHT);
    };

    P.speedOfSound = function (altitude) {
        var temperature = P.airTemperature(altitude);

        return Math.sqrt(
            K.ATMOSPHERE_GAMMA *
            K.ATMOSPHERE_GAS_CONSTANT *
            temperature
        );
    };

    P.machNumber = function (speed, altitude) {
        return speed / P.speedOfSound(altitude);
    };

    P.dynamicPressure = function (speed, density) {
        var rho = P.isNonNegative(density) ?
            density :
            K.ATMOSPHERE_SEA_LEVEL_DENSITY;

        return K.HALF * rho * speed * speed;
    };

    P.dynamicPressureAtAltitude = function (speed, altitude) {
        return P.dynamicPressure(speed, P.airDensity(altitude));
    };

    P.dragForce = function (
        dragCoefficient,
        referenceArea,
        speed,
        density
    ) {
        return P.dynamicPressure(speed, density) *
            dragCoefficient *
            referenceArea;
    };

    P.dragForceAtAltitude = function (
        dragCoefficient,
        referenceArea,
        speed,
        altitude
    ) {
        return P.dragForce(
            dragCoefficient,
            referenceArea,
            speed,
            P.airDensity(altitude)
        );
    };

    P.dragAcceleration = function (
        dragCoefficient,
        referenceArea,
        speed,
        density,
        mass
    ) {
        return P.dragForce(
            dragCoefficient,
            referenceArea,
            speed,
            density
        ) / mass;
    };

    P.ballisticCoefficient = function (
        mass,
        dragCoefficient,
        referenceArea
    ) {
        return mass / (dragCoefficient * referenceArea);
    };

    P.terminalVelocity = function (
        mass,
        gravitationalAcceleration,
        dragCoefficient,
        referenceArea,
        density
    ) {
        var g = P.isPositive(gravitationalAcceleration) ?
            gravitationalAcceleration :
            K.G0;
        var rho = P.isPositive(density) ?
            density :
            K.ATMOSPHERE_SEA_LEVEL_DENSITY;

        return Math.sqrt(
            K.TWO * mass * g /
            (
                rho *
                dragCoefficient *
                referenceArea
            )
        );
    };

    P.escapeVelocityFromBody = function (body) {
        return P.escapeVelocity(
            P.bodyRadius(body),
            P.bodyMu(body)
        );
    };

    P.surfaceOrbit = function (body) {
        var radius = P.bodyRadius(body);
        var mu = P.bodyMu(body);

        return {
            radius: radius,
            circularVelocity: P.circularVelocity(radius, mu),
            escapeVelocity: P.escapeVelocity(radius, mu),
            period: P.orbitalPeriod(radius, mu)
        };
    };

    P.orbitAtAltitude = function (altitude, body) {
        var radius = P.radiusAtAltitude(altitude, body);
        var mu = P.bodyMu(body);

        return {
            altitude: altitude,
            radius: radius,
            gravity: P.gravityAtRadius(radius, mu),
            circularVelocity: P.circularVelocity(radius, mu),
            escapeVelocity: P.escapeVelocity(radius, mu),
            period: P.orbitalPeriod(radius, mu),
            specificOrbitalEnergy: P.specificOrbitalEnergy(
                radius,
                P.circularVelocity(radius, mu),
                mu
            )
        };
    };

    P.energyToLift = function (
        mass,
        initialRadius,
        finalRadius,
        gravitationalParameter
    ) {
        var mu = P.isPositive(gravitationalParameter) ?
            gravitationalParameter :
            K.MU_EARTH;

        return mass * mu * (
            K.ONE / initialRadius -
            K.ONE / finalRadius
        );
    };

    P.orbitEnergyChange = function (
        mass,
        initialRadius,
        initialSpeed,
        finalRadius,
        finalSpeed,
        gravitationalParameter
    ) {
        return P.orbitalEnergy(
            mass,
            finalRadius,
            finalSpeed,
            gravitationalParameter
        ) - P.orbitalEnergy(
            mass,
            initialRadius,
            initialSpeed,
            gravitationalParameter
        );
    };

    P.lightTime = function (distance) {
        return distance / K.C;
    };

    P.lightTimeRoundTrip = function (distance) {
        return K.TWO * P.lightTime(distance);
    };

    P.angleDistance = function (radius, angle) {
        return radius * angle;
    };

    P.arcLength = function (radius, angle) {
        return radius * angle;
    };

    P.chordLength = function (radius, angle) {
        return K.TWO * radius * Math.sin(Math.abs(angle) * K.HALF);
    };

    P.round = function (value, decimals) {
        var places = P.isFinite(decimals) ? decimals : K.DISPLAY_DECIMALS;
        var factor = Math.pow(K.TEN, places);

        return Math.round(value * factor) / factor;
    };

    P.formatNumber = function (value, decimals) {
        var places = P.isFinite(decimals) ? decimals : K.DISPLAY_DECIMALS;
        var rounded = P.round(value, places);

        return String(rounded);
    };

    P.formatFixed = function (value, decimals) {
        var places = P.isFinite(decimals) ? decimals : K.DISPLAY_DECIMALS;

        return Number(value).toFixed(places);
    };

    P.formatDuration = function (seconds) {
        var remaining = Math.max(K.ZERO, seconds);
        var days = Math.floor(remaining / K.DAY);
        var hours;
        var minutes;
        var secondsPart;

        remaining -= days * K.DAY;
        hours = Math.floor(remaining / K.HOUR);
        remaining -= hours * K.HOUR;
        minutes = Math.floor(remaining / K.MINUTE);
        secondsPart = Math.round(remaining - minutes * K.MINUTE);

        return {
            days: days,
            hours: hours,
            minutes: minutes,
            seconds: secondsPart,
            totalSeconds: seconds
        };
    };

    P.formatMass = function (kilograms) {
        if (Math.abs(kilograms) >= K.TONNE) {
            return P.formatNumber(kilograms / K.TONNE) + " t";
        }

        return P.formatNumber(kilograms) + " kg";
    };

    P.formatDistance = function (meters) {
        if (Math.abs(meters) >= K.KM) {
            return P.formatNumber(meters / K.KM) + " km";
        }

        return P.formatNumber(meters) + " m";
    };

    P.formatVelocity = function (metersPerSecond) {
        return P.formatNumber(metersPerSecond) + " m/s";
    };

    P.formatTime = function (seconds) {
        var value = P.formatDuration(seconds);

        if (value.days > K.ZERO) {
            return value.days + " d " +
                value.hours + " h";
        }

        if (value.hours > K.ZERO) {
            return value.hours + " h " +
                value.minutes + " min";
        }

        if (value.minutes > K.ZERO) {
            return value.minutes + " min " +
                value.seconds + " s";
        }

        return value.seconds + " s";
    };

    P.formatEnergy = function (joules) {
        if (Math.abs(joules) >= K.GJ) {
            return P.formatNumber(joules / K.GJ) + " GJ";
        }

        if (Math.abs(joules) >= K.MJ) {
            return P.formatNumber(joules / K.MJ) + " MJ";
        }

        if (Math.abs(joules) >= K.KJ) {
            return P.formatNumber(joules / K.KJ) + " kJ";
        }

        return P.formatNumber(joules) + " J";
    };

    var Lec = {
        K: K,
        P: P
    };

    function escapeHTML(value) {
        return String(value === undefined || value === null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function hasClass(element, className) {
        var classes;

        if (!element || !element.className) {
            return false;
        }

        classes = " " + element.className + " ";

        return classes.indexOf(" " + className + " ") !== -1;
    }

    function findByClass(tagName, className) {
        var elements = document.getElementsByTagName(tagName);
        var i;

        for (i = K.ZERO; i < elements.length; i += K.ONE) {
            if (hasClass(elements[i], className)) {
                return elements[i];
            }
        }

        return null;
    }

    function pageIndex(index) {
        var value;
        var text;

        if (index === undefined || index === null || index === "") {
            return "";
        }

        value = Number(index);

        if (!P.isFinite(value)) {
            return escapeHTML(index);
        }

        text = String(value);

        while (text.length < K.PAGE_DIGITS) {
            text = "0" + text;
        }

        return text;
    }

    function renderMount(cfg) {
        var header;
        var footer;
        var headerHTML;
        var footerHTML;
        var index = pageIndex(cfg.index);
        var total = String(K.PAGE_TOTAL);
        var kicker = escapeHTML(cfg.kicker);
        var title = escapeHTML(cfg.title);
        var take = escapeHTML(cfg.take);

        header = document.getElementById("lec-header") ||
            findByClass("header", "lec-header");

        if (!header) {
            header = document.createElement("header");
            document.body.insertBefore(header, document.body.firstChild);
        }

        header.id = "lec-header";
        header.className = "lec-header";
        header.setAttribute("data-page", index);

        headerHTML =
            '<div class="lec-header__top">' +
                '<span class="lec-header__kicker">' + kicker + "</span>" +
                '<span class="lec-header__index">' +
                    index +
                    (index ? " / " + total : "") +
                "</span>" +
            "</div>" +
            '<h1 class="lec-header__title">' + title + "</h1>";

        header.innerHTML = headerHTML;

        footer = document.getElementById("lec-footer") ||
            findByClass("footer", "lec-footer");

        if (!footer) {
            footer = document.createElement("footer");
            document.body.appendChild(footer);
        }

        footer.id = "lec-footer";
        footer.className = "lec-footer";

        footerHTML =
            '<p class="lec-footer__take">' + take + "</p>" +
            '<p class="lec-footer__topic">火箭与轨道 · 怎么把东西送上太空，并让它待在那儿</p>';

        footer.innerHTML = footerHTML;

        if (title) {
            document.title = cfg.title;
        }

        return {
            header: header,
            footer: footer
        };
    }

    Lec.mount = function (cfg) {
        var options = cfg || {};
        var mountNow = function () {
            return renderMount(options);
        };

        if (typeof document === "undefined" || !document.body) {
            return null;
        }

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", mountNow, false);
            return null;
        }

        return mountNow();
    };

    root.Lec = Lec;
}(typeof window !== "undefined" ? window :
    (typeof global !== "undefined" ? global : this)));